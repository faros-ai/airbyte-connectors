import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {
  AWSV2VulnerabilityData,
  CicdArtifactKey,
  CicdArtifactVulnerabilityResponse,
  CicdOrgKey,
  CicdRepoKey,
  ExtendedVulnerabilityType,
  FarosObjectKey,
  GitV2VulnerabilityData,
  VcsRepoKey,
  VcsRepositoryVulnerabilityResponse,
} from './types';
import {getQueryFromName, looksLikeGitCommitSha} from './utils';

/*
Note: 
We use 'bind' to bind the function to the class instance. This is because we want 
to use the class instance's properties and methods in the function.
*/

export abstract class Vulnerabilities extends Converter {
  source = 'vanta';
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'vcs_RepositoryVulnerability',
    'cicd_ArtifactVulnerability',
    'vcs_RepositoryVulnerability__Update',
    'cicd_ArtifactVulnerability__Update',
    'vcs_Repository',
    'cicd_Artifact',
    'cicd_Repository',
  ];
  git_vulns: GitV2VulnerabilityData[] = [];
  awsv2_vulns: AWSV2VulnerabilityData[] = [];
  vulnsMissingIds: ExtendedVulnerabilityType[] = [];
  severityMap: {[key: string]: number} = {
    LOW: 3.0,
    MEDIUM: 6.0,
    HIGH: 9.0,
    CRITICAL: 10.0,
  };
  vantaBasedGitRepositoryNamesToVantaUids: Record<string, string[]> = {};
  awsV2ContainerNamesToUids: Record<string, string[]> = {};
  vantaVulnsFromGitUidsToRecords: Record<string, GitV2VulnerabilityData> = {};
  vantaVulnsFromAWSUidsToRecords: Record<string, AWSV2VulnerabilityData> = {};
  // It seems Vanta has duplicate UIDs for different vulns ???
  // We store these in a set along with vuln titles to keep track of them
  duplicateAwsV2UidsAndTitles: Set<[string, string]> = new Set();

  duplicateAwsUids: Set<string> = new Set();
  // We read from file synchronously to get query from file
  vcsRepositoryQuery = getQueryFromName('vcsRepositoryQuery');
  cicdArtifactQueryByCommitSha = getQueryFromName(
    'cicdArtifactQueryByCommitSha'
  );
  cicdArtifactQueryByRepoName = getQueryFromName('cicdArtifactQueryByRepoName');
  vcsRepositoryVulnerabilityQuery = getQueryFromName(
    'vcsRepositoryVulnerabilityQuery'
  );
  cicdArtifactVulnerabilityQuery = getQueryFromName(
    'cicdArtifactVulnerabilityQuery'
  );
  vulnerabilitiesWithMissingRepositoryNames: Set<string> = new Set();
  vulnerabilitiesWithMissingCICDArtifacts: Set<string> = new Set();
  noResponseFromVcsRepositoryQuery: Set<string> = new Set();
  noResponseFromCicdArtifactQuery: Set<string> = new Set();
  emptyResultsFromVcsRepositoryQuery: Set<string> = new Set();
  emptyResultsFromCicdArtifactQuery: Set<string> = new Set();
  noResponseAWSArtifactFromName: Set<string> = new Set();
  emptyResultsAWSArtifactFromName: Set<string> = new Set();
  nUpdatedVcsVulns: number = 0;
  nUpdatedCicdVulns: number = 0;
  missedRepositoryNames: Set<string> = new Set();
  nFarosRequests: number = 0;
  skipRepoNames: Set<string> = new Set([
    'destination-bigquery',
    'destination-postgres',
  ]);
  nRecordsProcessed: number = 0;
  maxNRecords: number | null = 100;
  filterLastNDays: number | null = null;

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.vuln_data?.id;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (this.maxNRecords && this.nRecordsProcessed >= this.maxNRecords) {
      return [];
    }
    if (this.filterLastNDays && record?.record?.data?.vuln_data?.createdAt) {
      // We get the current date and subtract the number of days we want to filter by
      const prev_date = new Date();
      prev_date.setDate(prev_date.getDate() - this.filterLastNDays);
      const record_date = new Date(record?.record?.data?.vuln_data?.createdAt);
      if (record_date.getTime() < prev_date.getTime()) {
        return [];
      }
    }
    if (record?.record?.data?.vuln_type === 'gitv2') {
      this.git_vulns.push(
        record?.record?.data?.vuln_data as GitV2VulnerabilityData
      );
    } else if (record?.record?.data?.vuln_type === 'awsv2') {
      this.awsv2_vulns.push(
        record?.record?.data?.vuln_data as AWSV2VulnerabilityData
      );
    }
    return [];
  }

  addUIDToMapping(
    name: string,
    uid: string,
    mapping: Record<string, string[]>
  ): void {
    if (name in mapping) {
      mapping[name].push(uid);
    } else {
      mapping[name] = [uid];
    }
  }

  convertDateFormat(inputDate: string): Date | null {
    // Try to parse the input date
    if (!inputDate) {
      return null;
    }
    try {
      const date = new Date(inputDate);
      return date;
    } catch (e) {
      return null;
    }
  }

  parseVantaVulnRecordsWithGitV2Origin(
    vantaVulnsFromGit: GitV2VulnerabilityData[]
  ): DestinationRecord[] {
    // Within this function, we parse the vanta vuln data from git (v2) origin.
    // We also populate the object, vantaBasedGitRepositoryNamesToVantaUids, which maps
    // the repository Name from the vuln (which should be a git repo name),
    // to the uids of the vulns associated with that repository. (Adds it to a list)
    const farosVulnRecords = [];
    for (const vuln of vantaVulnsFromGit) {
      if (!vuln.uid) {
        // Should not occur - we log these in case they appear.
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      const repoName = vuln.asset.displayName ? vuln.asset.displayName : '';
      this.addUIDToMapping(
        repoName,
        vuln.uid,
        this.vantaBasedGitRepositoryNamesToVantaUids
      );
      const cveId = vuln.externalVulnerabilityId
        ? vuln.externalVulnerabilityId
        : '';
      vuln['externalIds'] = [cveId];
      const vulnURL = vuln.relatedUrls?.length > 0 ? vuln.relatedUrls[0] : '';
      vuln['vulnURL'] = vulnURL;
      const sev: number = this.severityMap[vuln.severity];
      let sevString: string;
      if (!sev) {
        sevString = '0';
      } else {
        sevString = sev.toString();
      }
      vuln['severity'] = sevString;
      farosVulnRecords.push(
        this.getSecVulnerabilityRecordFromData(
          vuln as ExtendedVulnerabilityType
        )
      );
      this.vantaVulnsFromGitUidsToRecords[vuln.uid] = vuln;
    }
    return farosVulnRecords;
  }

  async runFunctionInBatches(
    names: string[],
    fc: FarosClient,
    ctx: StreamContext,
    batchSize: number,
    func: (
      names: string[],
      fc: FarosClient,
      ctx: StreamContext
    ) => Promise<FarosObjectKey[]>
  ): Promise<FarosObjectKey[]> {
    const uniqueNames = Array.from(new Set(names));
    // Split the ordered names into batches
    const batches = [];
    for (let i = 0; i < uniqueNames.length; i += batchSize) {
      batches.push(uniqueNames.slice(i, i + batchSize));
    }
    const allResults: FarosObjectKey[] = [];
    for (const batch of batches) {
      const results = await func(batch, fc, ctx);
      allResults.push(...results);
    }
    return allResults;
  }

  async getVCSRepositoriesFromNames(
    vcsRepoNames: string[],
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<VcsRepoKey[]> {
    ctx.logger.info(`Getting VCS repositories from names: ${vcsRepoNames}`);
    const result = await fc.gql(ctx.graph, this.vcsRepositoryQuery, {
      vcsRepoNames,
      limit: vcsRepoNames.length,
    });
    const results = result?.vcs_Repository;
    if (!results) {
      ctx.logger.debug(
        `Did not get any results for vcsRepository query with names "${vcsRepoNames}"`
      );
      this.emptyResultsFromVcsRepositoryQuery.add(vcsRepoNames.join(', '));
      return [];
    }
    // We get all the names of the repositories we got back
    const resultRepoNames = results.map((repo) => repo.name);
    if (results.length < vcsRepoNames.length) {
      ctx.logger.debug(
        `Did not get all results for vcsRepository query with names "${vcsRepoNames}"`
      );
      // We get the difference between the names we queried for and the names we got back:
      const missingRepoNames: Set<string> = new Set();
      for (const repo of vcsRepoNames) {
        if (!resultRepoNames.includes(repo)) {
          missingRepoNames.add(repo);
        }
      }
      // We extend the set 'this.missedRepositoryNames' with the new missing repo names:
      missingRepoNames.forEach((name) => this.missedRepositoryNames.add(name));
    } else if (resultRepoNames.length === vcsRepoNames.length) {
      ctx.logger.debug(
        `Got exactly the same results for vcsRepository query from names "${vcsRepoNames}."` +
          `Results: ${resultRepoNames}.`
      );
    } else {
      ctx.logger.warn(
        `Got more results than expected for vcsRepository query from names "${vcsRepoNames}".`
      );
    }

    return results;
  }

  async getCICDArtifactsFromCommitShas(
    commitShas: string[],
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<CicdArtifactKey[]> {
    const result = await fc.gql(ctx.graph, this.cicdArtifactQueryByCommitSha, {
      commitShas,
      limit: commitShas.length,
    });
    const results = result?.cicd_Artifact;
    if (!results) {
      ctx.logger.debug(
        `Did not get a response for cicdArtifact query with commit shas "${commitShas}"`
      );
      commitShas.forEach((sha) =>
        this.noResponseFromCicdArtifactQuery.add(sha)
      );
      return [];
    }
    return results;
  }

  async getAWSCicdArtifactsFromNames(
    repoNames: string[],
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<CicdArtifactKey[]> {
    ctx.logger.info(`Getting AWS cicd artifacts from names: ${repoNames}`);
    const result = await fc.gql(ctx.graph, this.cicdArtifactQueryByRepoName, {
      repoNames,
      limit: repoNames.length,
    });
    const results = result?.cicd_Artifact;
    if (!results) {
      ctx.logger.debug(
        `Did not get a response for cicdArtifact query with repository names "${repoNames}"`
      );
      repoNames.forEach((name) => this.noResponseAWSArtifactFromName.add(name));
      return [];
    }
    return results;
  }

  createMissingRepositoryDestinationRecords(
    missedRepositoryNames: Set<string>
  ): [VcsRepoKey[], DestinationRecord[]] {
    const vcsRepoKeys = [];
    const vcsDestinationRecords = [];
    for (const repoName of missedRepositoryNames) {
      const vcsRepoKey = {
        name: repoName,
        organization: {
          uid: 'faros-ai',
          source: 'GitHub',
        },
      };
      vcsRepoKeys.push(vcsRepoKey);
      vcsDestinationRecords.push({
        model: 'vcs_Repository',
        record: vcsRepoKey,
      });
    }
    return [vcsRepoKeys, vcsDestinationRecords];
  }

  async getVCSMappingsFromGitVulns(
    vantaBasedGitRepoNamesToUids: Record<string, string[]>,
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // Faros Client is passed in as an argument in case we want to change it in the future
    // In this function we associate the repo vulns to the repositories in faros.
    // We can grab all the repositories from the names in the vuln data
    // We also create new vcs Repo objects in case there is a referenced repo which
    // does not exist. This ensures we create an entry for each new vuln

    // This object may contain both vcs_RepositoryVulnerability and vcs_Repository records
    const vcs_RepoRecords: DestinationRecord[] = [];
    const allVantaBasedGitRepoNames = Object.keys(vantaBasedGitRepoNamesToUids);
    const allFarosRepoKeys: VcsRepoKey[] = (await this.runFunctionInBatches(
      allVantaBasedGitRepoNames,
      fc,
      ctx,
      100,
      this.getVCSRepositoriesFromNames.bind(this)
    )) as VcsRepoKey[];

    const [newlyCreatedFarosRepoKeys, newVcsRepoDestinationRecords] =
      this.createMissingRepositoryDestinationRecords(
        this.missedRepositoryNames
      );
    vcs_RepoRecords.push(...newVcsRepoDestinationRecords);
    const farosRepoNameToKey: Record<string, VcsRepoKey> = {};
    allFarosRepoKeys.push(...newlyCreatedFarosRepoKeys);
    for (const farosRepoKey of allFarosRepoKeys) {
      farosRepoNameToKey[farosRepoKey.name] = farosRepoKey;
    }
    for (const [vantaRepoName, vantaUids] of Object.entries(
      vantaBasedGitRepoNamesToUids
    )) {
      const repoKey = farosRepoNameToKey[vantaRepoName];
      if (repoKey) {
        for (const vantaUid of vantaUids) {
          const vulnKey = {
            uid: vantaUid,
            source: this.source,
          };
          const vuln: GitV2VulnerabilityData =
            this.vantaVulnsFromGitUidsToRecords[vantaUid];
          if (!vuln) {
            ctx.logger.debug(
              `Could not find vulnerability with uid "${vantaUid}" in gitUidsToVulns`
            );
            continue;
          }
          vcs_RepoRecords.push({
            model: 'vcs_RepositoryVulnerability',
            record: {
              repository: repoKey,
              vulnerability: vulnKey,
              url: this.encodeURL(vuln.externalURL),
              dueAt: this.convertDateFormat(vuln.remediateBy),
              createdAt: this.convertDateFormat(vuln.createdAt),
              status: {
                category: this.getVulnStatusCategory(vuln),
                detail: this.getVulnStatusDetail(vuln),
              },
            },
          });
        }
      }
    }
    return vcs_RepoRecords;
  }

  getVulnStatusDetail(
    vuln: AWSV2VulnerabilityData | GitV2VulnerabilityData
  ): string {
    if (vuln.ignored?.ignoreReason) {
      return vuln.ignored.ignoreReason;
    } else {
      return '';
    }
  }

  getVulnStatusCategory(
    vuln: AWSV2VulnerabilityData | GitV2VulnerabilityData
  ): string {
    if (vuln.ignored?.ignoreReason) {
      return 'Ignored';
    } else if (vuln.ignored?.ignoredUntil) {
      return 'Ignored';
    } else {
      return 'Open';
    }
  }

  getCommitShasFromAWSVulns(
    vulns: AWSV2VulnerabilityData[],
    ctx: StreamContext
  ): [
    Set<string>,
    Record<string, AWSV2VulnerabilityData>,
    AWSV2VulnerabilityData[],
  ] {
    // Note: vulns argument represents both AWS v1 and AWS v2 vulns records (AWSV2VulnerabilityData)
    const seenUids: Set<string> = new Set();
    const allCommitShas: Set<string> = new Set();
    const commitShasToVulns: Record<string, AWSV2VulnerabilityData> = {};
    const vulnsWithNoCommitShas: AWSV2VulnerabilityData[] = [];
    let totalMissed = 0;
    for (const vuln of vulns) {
      // First we check for dup uids
      const uid: string = this.getUidFromAWSVuln(vuln);
      const title: string = vuln.displayName ? vuln.displayName : uid;
      if (seenUids.has(uid)) {
        ctx.logger.debug(
          'Found duplicate vuln id (commit sha from AWS V2): ' + uid
        );
        this.duplicateAwsV2UidsAndTitles.add([uid, title]);
        continue;
      }
      seenUids.add(uid);

      // We need to do the following for each vuln:
      // Get the image tags. For each image tag, check if it is a git commit sha
      // if it is, add it to the set of commit shas to use later to query for cicd artifacts
      const imageTags = vuln.imageTags;
      if (!imageTags || imageTags.length === 0) {
        totalMissed += 1;
        vulnsWithNoCommitShas.push(vuln);
        continue;
      }
      let commitSha = null;
      for (const tag of imageTags) {
        if (looksLikeGitCommitSha(tag)) {
          commitSha = tag;
          break;
        }
      }
      if (!commitSha) {
        totalMissed += 1;
        vulnsWithNoCommitShas.push(vuln);
        continue;
      }
      allCommitShas.add(commitSha);
      commitShasToVulns[commitSha] = vuln;
    }
    ctx.logger.info(
      `For commit shas, total missed: ${totalMissed}, total vulns: ${vulns.length}`
    );
    return [allCommitShas, commitShasToVulns, vulnsWithNoCommitShas];
  }

  getRepoNameAndArtifactUidFromAWSVuln(
    awsVuln: AWSV2VulnerabilityData,
    inpRepo: string,
    inpArtifactUid: string,
    vuln_type: string
  ): [string, string] {
    // Depending on the vuln type, we pull out the correct repo name and artifact uid
    if (vuln_type === 'awsv2') {
      const repoName = awsVuln.asset.displayName
        ? awsVuln.asset.displayName
        : inpRepo;
      const artifactUid = awsVuln.imageDigest
        ? awsVuln.imageDigest
        : inpArtifactUid;
      return [repoName, artifactUid];
    } else {
      throw new Error(`Invalid vuln type: ${vuln_type}`);
    }
  }

  createAssociatedCicdArtifacts(
    aws_vulns_with_no_associated_commit_shas: AWSV2VulnerabilityData[],
    vuln_type: string
  ): [
    CicdArtifactKey[],
    DestinationRecord[],
    Record<string, AWSV2VulnerabilityData>,
  ] {
    // vuln_type 'awsv2' or 'aws'
    const cicdArtifactKeys: CicdArtifactKey[] = [];
    const destRecords: DestinationRecord[] = [];
    const org_key: CicdOrgKey = {
      uid: 'farosai',
      source: 'Docker',
    };
    const newCommitShasToVulns: Record<string, AWSV2VulnerabilityData> = {};
    for (const vuln of aws_vulns_with_no_associated_commit_shas) {
      // For every vuln, we start by assuming we won't get a repo name or a cicd artifact uid
      let repoName: string = 'vanta-aws-repo';
      let artifactUid: string = vuln.uid;
      [repoName, artifactUid] = this.getRepoNameAndArtifactUidFromAWSVuln(
        vuln,
        repoName,
        artifactUid,
        vuln_type
      );
      const cicdRepositoryKey: CicdRepoKey = {
        organization: org_key,
        uid: repoName,
      };
      const cicdArtifactKey: CicdArtifactKey = {
        uid: artifactUid,
        repository: cicdRepositoryKey,
      };
      cicdArtifactKeys.push(cicdArtifactKey);
      destRecords.push(
        {
          model: 'cicd_Artifact',
          record: cicdArtifactKey,
        },
        {
          model: 'cicd_Repository',
          record: cicdRepositoryKey,
        }
      );
      newCommitShasToVulns[artifactUid] = vuln;
    }

    return [cicdArtifactKeys, destRecords, newCommitShasToVulns];
  }

  async getCommitShaDataFromFarosUsingAWSVulns(
    aws_vulns: AWSV2VulnerabilityData[],
    fc: FarosClient,
    ctx: StreamContext,
    vuln_type: string
  ): Promise<
    [
      Record<string, AWSV2VulnerabilityData>,
      Record<string, CicdArtifactKey>,
      DestinationRecord[],
    ]
  > {
    // Within this function, we get the commit shas from the AWS vulns which
    // we are able to parse. For those, we attempt to get CICD Artifacts from
    // Faros.
    const [allParsedCommitShas, commitShasToVulns, vulnsWithNoCommitShas] =
      this.getCommitShasFromAWSVulns(aws_vulns, ctx);
    // within this function we query faros for the cicd artifacts
    const cicdArtifactKeys: CicdArtifactKey[] =
      (await this.runFunctionInBatches(
        Array.from(allParsedCommitShas),
        fc,
        ctx,
        100,
        this.getCICDArtifactsFromCommitShas.bind(this)
      )) as CicdArtifactKey[];
    // within this function we simply create the cicd artifacts for the vulns with no commit shas
    const [
      newlyCreatedCicdArtifactKeys,
      cicdArtifactDestRecords,
      newCommitShasToVulns,
    ] = this.createAssociatedCicdArtifacts(vulnsWithNoCommitShas, vuln_type);
    cicdArtifactKeys.push(...newlyCreatedCicdArtifactKeys);
    const combinedCommitShasToVulns = {
      ...commitShasToVulns,
      ...newCommitShasToVulns,
    };
    const commitShaToArtifactKey: Record<string, CicdArtifactKey> = {};
    for (const artifact of cicdArtifactKeys) {
      commitShaToArtifactKey[artifact.uid] = artifact;
    }
    return [
      combinedCommitShasToVulns,
      commitShaToArtifactKey,
      cicdArtifactDestRecords,
    ];
  }

  encodeURL(url: string | null): string {
    // For now no encoding applied
    if (!url) {
      return '';
    }
    return url;
    // We split by 'findingArn=' and encode the second part and add to the first:
    // const split = url.split('findingArn=');
    // if (split.length !== 2) {
    //   return encodeURIComponent(url);
    // }
    // const arn = split[1];
    // const encodedArn: string = encodeURIComponent(arn);
    // const encodedUrl: string = split[0] + 'findingArn=' + encodedArn;
    // return encodedUrl;
  }

  async getCICDMappingsFromAWSV2(
    aws_vulns: AWSV2VulnerabilityData[],
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // Within this function, we first get all the potential commit shas from
    // the AWS V2 Container Vulnerability data. We create a mapping from
    // commit Sha to Vuln Data (in Airbyte Record form) in order to use it later.
    // We then get the cicd_Artifact keys from the commit shas we collected.
    // Within the cicdArtifactKeys, note that the "uid" is the commit sha for the artifact.
    // Finally, for each commit sha we have, we can now create an association between
    // the cicdArtifact and the AWS V2 container vulnerability.
    // * Sidenote: Faros Client is passed in as an argument in case we want to change it in the future
    const [
      commitShasToVulns,
      commitShaToArtifactKey,
      cicdArtifactDestinationRecords,
    ] = await this.getCommitShaDataFromFarosUsingAWSVulns(
      aws_vulns,
      fc,
      ctx,
      'awsv2'
    );
    const res = cicdArtifactDestinationRecords;
    for (const commitSha of Object.keys(commitShaToArtifactKey)) {
      const CicdArtifactKey = commitShaToArtifactKey[commitSha];
      if (CicdArtifactKey) {
        const vuln = commitShasToVulns[commitSha];
        res.push({
          model: 'cicd_ArtifactVulnerability',
          record: {
            artifact: CicdArtifactKey,
            vulnerability: {
              uid: this.getUidFromAWSVuln(vuln),
              source: this.source,
            },
            url: this.encodeURL(vuln.externalURL),
            dueAt: this.convertDateFormat(vuln.remediateBy),
            createdAt: this.convertDateFormat(vuln.createdAt),
            acknowledgedAt: this.convertDateFormat(vuln.createdAt),
            status: {
              category: this.getVulnStatusCategory(vuln),
              detail: this.getVulnStatusDetail(vuln),
            },
          },
        });
      }
    }
    return res;
  }

  getUidFromAWSVuln(vuln: AWSV2VulnerabilityData): string {
    // We keep the uid retreival in this function because if we choose to modify
    // the uid in the future, it will remain consistent in all cases.
    return vuln.uid;
  }

  parseVantaVulnRecordsWithAwsV2Origin(
    data: AWSV2VulnerabilityData[]
  ): DestinationRecord[] {
    const vuln_data = [];
    for (const vuln of data) {
      if (!vuln.uid) {
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      const sev: number = this.severityMap[vuln.severity];
      let sevString: string;
      if (!sev) {
        sevString = '0';
      } else {
        sevString = sev.toString();
      }
      const uid = this.getUidFromAWSVuln(vuln);
      let vulnURL = '';
      if (vuln.relatedUrls && vuln.relatedUrls.length > 0) {
        vulnURL = vuln.relatedUrls[0];
      }
      const vuln_copy: ExtendedVulnerabilityType = {
        uid,
        createdAt: vuln.createdAt,
        externalURL: vuln.externalURL,
        severity: sevString,
        description: vuln.description,
        displayName: vuln.displayName,
        vulnerabilityIds: [vuln.externalVulnerabilityId],
        vulnURL,
      };

      vuln_data.push(this.getSecVulnerabilityRecordFromData(vuln_copy));
      this.vantaVulnsFromAWSUidsToRecords[vuln.uid] = vuln;
    }
    return vuln_data;
  }

  combineAwsVulns(
    aws_v1_vulns: DestinationRecord[],
    aws_v2_vulns: DestinationRecord[],
    ctx: StreamContext
  ): DestinationRecord[] {
    // We want to remove the vulns that appear in both AWS v1 and AWS v2 lists
    // keeping the AWS v2 vuln if there is an overlap
    const seenV2Uids: Set<string> = new Set();
    const seenV1Uids: Set<string> = new Set();
    const combined = [];
    let v2Overlap = 0;
    let v1v2Overlap = 0;
    let v1Overlap = 0;

    for (const vuln of aws_v2_vulns) {
      if (!seenV2Uids.has(vuln.record.uid)) {
        combined.push(vuln);
        seenV2Uids.add(vuln.record.uid);
      } else {
        v2Overlap += 1;
        this.duplicateAwsUids.add(vuln.record.uid);
      }
    }
    for (const vuln of aws_v1_vulns) {
      if (
        !seenV2Uids.has(vuln.record.uid) &&
        !seenV1Uids.has(vuln.record.uid)
      ) {
        combined.push(vuln);
        seenV1Uids.add(vuln.record.uid);
      } else {
        if (seenV2Uids.has(vuln.record.uid)) {
          v1v2Overlap += 1;
        } else {
          v1Overlap += 1;
        }
        this.duplicateAwsUids.add(vuln.record.uid);
      }
    }
    // We expect the overlap to only exist in v1/v2 overlap, rather
    // than overlapping within their categories
    let log_str = `AWS v1 and v2 vuln overlap: ${v1v2Overlap}`;
    log_str += `, AWS v2 vuln overlap: ${v2Overlap}`;
    log_str += `, AWS v1 vuln overlap: ${v1Overlap}.\n`;
    log_str += `Total duplicate AWS UIDs (after combining AWS v1 and v2): ${this.duplicateAwsUids.size}`;
    ctx.logger.info(log_str);

    return combined;
  }

  getSecVulnerabilityRecordFromData(
    data: ExtendedVulnerabilityType
  ): DestinationRecord {
    // The required fields (ones which cannot be null) are uid and source
    // Note that severity must be a string of a float
    if (!data.uid || !this.source) {
      throw new Error(
        'Vulnerability data must have a uid and source. Data: ' +
          JSON.stringify(data) +
          JSON.stringify(data.uid)
      );
    }
    if (data.description?.length > 200) {
      data.description = data.description.slice(0, 200);
    }
    // Check if severity is a valid number in string format:
    if (data.severity) {
      if (isNaN(parseFloat(data.severity))) {
        throw new Error(
          `Severity must be a valid number in string format. Data: ${data}`
        );
      }
    }
    return {
      model: 'sec_Vulnerability',
      record: {
        uid: data.uid,
        source: this.source,
        title: data.displayName,
        description: data.description,
        severity: data.severity,
        url: this.encodeURL(data.vulnURL),
        discoveredAt: this.convertDateFormat(data.createdAt),
        vulnerabilityIds: data.externalIds,
      },
    };
  }

  printReport(ctx: StreamContext): void {
    const report_obj = {
      nVulnsMissingIds: this.vulnsMissingIds.length,
      nDuplicateAwsUids: this.duplicateAwsUids.size,
      nVulnerabilitiesWithMissingRepositoryNames:
        this.vulnerabilitiesWithMissingRepositoryNames.size,
      nVulnerabilitiesWithMissingCICDArtifacts:
        this.vulnerabilitiesWithMissingCICDArtifacts.size,
      nNoResponseFromVcsRepositoryQuery:
        this.noResponseFromVcsRepositoryQuery.size,
      nNoResponseFromCicdArtifactQuery:
        this.noResponseFromCicdArtifactQuery.size,
      nEmptyResultsFromVcsRepositoryQuery:
        this.emptyResultsFromVcsRepositoryQuery.size,
      nEmptyResultsFromCicdArtifactQuery:
        this.emptyResultsFromCicdArtifactQuery.size,
      nNoResponseAWSArtifactFromName: this.noResponseAWSArtifactFromName.size,
      nEmptyResultsAWSArtifactFromName:
        this.emptyResultsAWSArtifactFromName.size,
      nMissedRepositoryNames: this.missedRepositoryNames.size,
      nFarosRequests: this.nFarosRequests,
      nResolvedVCSVulns: this.nUpdatedVcsVulns,
      nResolvedCICDVulns: this.nUpdatedCicdVulns,
    };
    ctx.logger.info(
      'Vulnerabilities converter report: \n' +
        JSON.stringify(report_obj, null, 2)
    );
  }

  getTotalNumberOfRecords(): number {
    return this.git_vulns.length + this.awsv2_vulns.length;
  }

  async getPaginatedQueryResponseFromFaros(
    ctx,
    query: string,
    key: string
  ): Promise<any> {
    const res = [];
    const LIMIT = 1000;
    let resp = await ctx.farosClient.gql(ctx.graph, query, {
      limit: LIMIT,
      id: '',
    });
    let crt_res_list: any[] = resp[key];
    // Check if crt_res_list is what we expect
    if (!crt_res_list) {
      throw new Error(`Expected response to have key ${key}. Query: ${query}`);
    }
    res.push(...crt_res_list);
    while (crt_res_list.length === LIMIT) {
      const new_id = crt_res_list[crt_res_list.length - 1].id;
      resp = await ctx.farosClient.gql(ctx.graph, query, {
        id: new_id,
        limit: LIMIT,
      });
      crt_res_list = resp[key];
      res.push(...crt_res_list);
    }
    return res;
  }

  async getAllUnresolvedObjectVulnerabilities(
    ctx: StreamContext,
    query: string,
    key: string
  ): Promise<
    VcsRepositoryVulnerabilityResponse[] | CicdArtifactVulnerabilityResponse[]
  > {
    const resp_list = await this.getPaginatedQueryResponseFromFaros(
      ctx,
      query,
      key
    );
    return resp_list;
  }

  async getUpdateVCSVulnsRecords(
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // This function and getUpdateCICDVulnsRecords are very similar - can be
    // refactored to be more DRY
    const allUnresolvedVcsRepositoryVulnerabilities =
      (await this.getAllUnresolvedObjectVulnerabilities(
        ctx,
        this.vcsRepositoryVulnerabilityQuery,
        'vcs_RepositoryVulnerability'
      )) as VcsRepositoryVulnerabilityResponse[];

    const allActiveVulnUids: Set<string> = new Set(
      Object.keys(this.vantaVulnsFromGitUidsToRecords)
    );
    const idsToUpdateToResolved = new Set<string>();
    const idsToKeys: Record<string, VcsRepositoryVulnerabilityResponse> = {};
    for (const unresolvedVuln of allUnresolvedVcsRepositoryVulnerabilities) {
      if (!unresolvedVuln.vulnerability) {
        continue;
      }
      const uid = unresolvedVuln.vulnerability?.uid;
      if (!uid || !unresolvedVuln.id) {
        throw new Error(
          'Unresolved vulnerability does not have either a uid or an id.'
        );
      }
      if (!allActiveVulnUids.has(uid)) {
        // We need to update the vulnerability to be resolved
        idsToUpdateToResolved.add(unresolvedVuln.id);
        idsToKeys[unresolvedVuln.id] = unresolvedVuln;
      }
    }
    if (idsToUpdateToResolved.size === 0) {
      ctx.logger.debug(
        `All ${allUnresolvedVcsRepositoryVulnerabilities.length} unresolved repo vulnerabilities are in the current set of vulnerabilities.`
      );
    } else {
      ctx.logger.debug(
        `Out of ${allUnresolvedVcsRepositoryVulnerabilities.length} unresolved repo vulnerabilities, ${idsToUpdateToResolved.size} are not in the current set of vulnerabilities and will be resolved.`
      );
    }
    // We update the vulnerabilities to be resolved
    const nowDate = new Date().toISOString();
    const vcsVulnResolutionDestinationRecords: DestinationRecord[] = [];
    for (const id of Array.from(idsToUpdateToResolved)) {
      const vulnerability = idsToKeys[id].vulnerability;
      const repository = idsToKeys[id].repository;
      vcsVulnResolutionDestinationRecords.push({
        model: 'vcs_RepositoryVulnerability__Update',
        record: {
          at: nowDate,
          where: {vulnerability, repository},
          mask: ['resolvedAt'],
          patch: {
            resolvedAt: nowDate,
          },
        },
      });
    }
    return vcsVulnResolutionDestinationRecords;
  }

  async getUpdateCICDVulnsRecords(
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // We first get a list of all unresolved cicd artifact vulnerabilities from Faros
    const allUnresolvedCicdArtifactVulnerabilities: CicdArtifactVulnerabilityResponse[] =
      (await this.getAllUnresolvedObjectVulnerabilities(
        ctx,
        this.cicdArtifactVulnerabilityQuery,
        'cicd_ArtifactVulnerability'
      )) as CicdArtifactVulnerabilityResponse[];

    // Then we get all the current active uids for vulns
    const allActiveVulnUids: Set<string> = new Set(
      Object.keys(this.vantaVulnsFromAWSUidsToRecords)
    );

    // We create two objects within this function to keep track of the ids we need to update
    const idsToUpdateToResolved = new Set<string>();
    const idsToKeys: Record<string, CicdArtifactVulnerabilityResponse> = {};
    for (const unresolvedVuln of allUnresolvedCicdArtifactVulnerabilities) {
      if (!unresolvedVuln.vulnerability) {
        // Missing vulnerability from unresolved cicd Artifact vulnerability
        continue;
      }
      const uid = unresolvedVuln.vulnerability?.uid;
      if (!uid || !unresolvedVuln.id) {
        throw new Error(
          'Unresolved vulnerability does not have either a uid or an id.'
        );
      }
      if (!allActiveVulnUids.has(uid)) {
        // We need to update the vulnerability to be resolved
        idsToUpdateToResolved.add(unresolvedVuln.id);
        idsToKeys[unresolvedVuln.id] = unresolvedVuln;
      }
    }
    if (idsToUpdateToResolved.size === 0) {
      ctx.logger.debug(
        `All ${allUnresolvedCicdArtifactVulnerabilities.length} unresolved repo vulnerabilities are in the current set of vulnerabilities.`
      );
    } else {
      ctx.logger.debug(
        `Out of ${allUnresolvedCicdArtifactVulnerabilities.length} unresolved cicd Artifacts, ${idsToUpdateToResolved.size} are not in the current set of vulnerabilities and will be resolved.`
      );
    }
    // We update the vulnerabilities to be resolved
    const nowDate = new Date().toISOString();
    const cicdArtifactResolutionDestinationRecords: DestinationRecord[] = [];
    for (const id of Array.from(idsToUpdateToResolved)) {
      const vulnerability = idsToKeys[id].vulnerability;
      const artifact = idsToKeys[id].artifact;
      cicdArtifactResolutionDestinationRecords.push({
        model: 'cicd_ArtifactVulnerability__Update',
        record: {
          at: nowDate,
          where: {vulnerability, artifact},
          mask: ['resolvedAt'],
          patch: {
            resolvedAt: nowDate,
          },
        },
      });
    }
    return cicdArtifactResolutionDestinationRecords;
  }

  async updateExistingVulnerabilities(
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // We want to observe the current vulnerabilities from the faros graph and update them
    // in batches. This means we get all the unresolved vulnerabilities from the graph
    // and check if they exist in the current set of vulnerabilities coming from the source.
    // If they do not, we update the vulnerabilities 'resolvedAt' field to the current time.
    const vcsVulnResolutionDestinationRecords =
      await this.getUpdateVCSVulnsRecords(ctx);
    this.nUpdatedVcsVulns = vcsVulnResolutionDestinationRecords.length;
    const cicdArtifactResolutionDestinationRecords =
      await this.getUpdateCICDVulnsRecords(ctx);
    this.nUpdatedCicdVulns = cicdArtifactResolutionDestinationRecords.length;
    return [
      ...vcsVulnResolutionDestinationRecords,
      ...cicdArtifactResolutionDestinationRecords,
    ];
  }

  removeDuplicateRecords(records: DestinationRecord[]): DestinationRecord[] {
    // We check if records are the same by converting them to strings
    const seenRecords = new Set<string>();
    const res = [];
    for (const record of records) {
      const recordStr = JSON.stringify(record);
      if (!seenRecords.has(recordStr)) {
        seenRecords.add(recordStr);
        res.push(record);
      }
    }
    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    // Within the onProcessingComplete function, we perform queries to match
    // vulnerabilities to their associated vcs repositories and cicd artifacts.
    // In order to do this, we need to find the key fields which we can
    // use to query the graph. In the case of vcs Repositories, we use the
    // repository name. In the case of cicd artifacts, we use the commit sha,
    // and if we cannot get the commit sha for cicd artifacts, we create cicd artifacts
    // and create associations between vulns and those newly created cicd artifacts.
    // Additionally, we update the existing vulnerabilities in the graph to be resolved
    // if they are not in the current set of vulnerabilities.
    ctx.logger.debug(
      'Running onProcessing Complete. Total number of records to process: ' +
        this.getTotalNumberOfRecords()
    );

    const res = [];
    // Getting sec_Vulnerability records (no association)
    // We combine the records from AWS and AWS V2 because there
    // is overlap between the two lists.
    res.push(...this.parseVantaVulnRecordsWithGitV2Origin(this.git_vulns));
    const aws_v2_vulns = this.parseVantaVulnRecordsWithAwsV2Origin(
      this.awsv2_vulns
    );
    res.push(...aws_v2_vulns);

    // In the following functions we query Faros for the related VCS and CICD data.
    // Ideally, each vuln will be associated with either a VCS repository or a CICD artifact.
    if (!ctx.farosClient) {
      throw new Error('Faros client not found in context');
    }

    // Getting vcs_RepositoryVulnerability records
    const vcsMappings = await this.getVCSMappingsFromGitVulns(
      this.vantaBasedGitRepositoryNamesToVantaUids,
      ctx.farosClient,
      ctx
    );
    res.push(...vcsMappings);

    // Getting cicd_ArtifactVulnerability and cicd_Artifact destination records
    const cicdArtifactMappingsAWSV2 = await this.getCICDMappingsFromAWSV2(
      this.awsv2_vulns,
      ctx.farosClient,
      ctx
    );
    res.push(...cicdArtifactMappingsAWSV2);

    // If a vuln record no longer appears in vanta (but appears in faros)
    // then we update its resolvedDate to the current time
    if (
      ctx.config.source_specific_configs?.vanta?.updateExistingVulnerabilities
    ) {
      ctx.logger.info('Updating existing vulnerabilities resolvedAt');
      const updateDestinationRecords =
        await this.updateExistingVulnerabilities(ctx);
      res.push(...updateDestinationRecords);
    } else {
      ctx.logger.info('Skipping updating existing vulnerabilities');
    }
    // There are bound to be duplicate records because of cicd_Artifact creation
    const output_res: DestinationRecord[] = this.removeDuplicateRecords(res);

    this.printReport(ctx);
    return output_res;
  }
}
