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
  AWSVulnerabilityData,
  CicdArtifactKey,
  ExtendedVulnerabilityType,
  FarosObjectKey,
  GithubVulnerabilityData,
  VcsRepoKey,
  VulnerabilityInfo,
} from './types';
import {getQueryFromName, looksLikeGithubCommitSha} from './utils';

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
  ];
  git_vulns: GithubVulnerabilityData[] = [];
  aws_vulns: AWSVulnerabilityData[] = [];
  awsv2_vulns: AWSV2VulnerabilityData[] = [];
  vulnsMissingIds: ExtendedVulnerabilityType[] = [];
  severityMap: {[key: string]: number} = {
    LOW: 3.0,
    MEDIUM: 6.0,
    HIGH: 9.0,
    CRITICAL: 10.0,
  };
  repositoryNamesToUids: Record<string, string[]> = {};
  awsV2ContainerNamesToUids: Record<string, string[]> = {};
  gitUidsToVulns: Record<string, GithubVulnerabilityData> = {};
  awsUidsToVulns: Record<string, AWSVulnerabilityData> = {};
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
    if (record?.record?.data?.vuln_type === 'git') {
      this.git_vulns.push(
        record?.record?.data?.vuln_data as GithubVulnerabilityData
      );
    } else if (record?.record?.data?.vuln_type === 'aws') {
      this.aws_vulns.push(
        record?.record?.data?.vuln_data as AWSVulnerabilityData
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

  getVulnRecordsFromGit(data: GithubVulnerabilityData[]): DestinationRecord[] {
    const vuln_data = [];
    for (const vuln of data) {
      if (!vuln.uid) {
        // Should not occur - we log these in case they appear.
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      vuln['description'] = vuln.securityAdvisory.description;
      this.addUIDToMapping(
        vuln.repositoryName,
        vuln.uid,
        this.repositoryNamesToUids
      );
      vuln_data.push(
        this.getSecVulnerabilityRecordFromData(
          vuln as ExtendedVulnerabilityType
        )
      );
      this.gitUidsToVulns[vuln.uid] = vuln;
    }
    return vuln_data;
  }

  getVulnRecordsFromAws(data: AWSVulnerabilityData[]): DestinationRecord[] {
    // Note - we modify the UID to include CVE string if it exists
    const vuln_data = [];
    for (const vuln of data) {
      if (!vuln.uid) {
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      for (const finding of vuln.findings) {
        // We copy vuln data and add the finding data to it
        const new_vuln = {...vuln};
        const cve_str = finding['name'] ? finding['name'] : '';
        const uid_addition = '|' + cve_str.split(' ')[0];
        new_vuln.uid += uid_addition;
        new_vuln['description'] = finding['description']
          ? finding['description']
          : 'No description found';
        vuln_data.push(
          this.getSecVulnerabilityRecordFromData(
            new_vuln as ExtendedVulnerabilityType
          )
        );
        this.awsUidsToVulns[new_vuln.uid] = new_vuln;
      }
    }
    return vuln_data;
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

  async getVCSRepositoriesFromNamesBatches(
    vcsRepoNames: string[],
    fc: FarosClient,
    ctx: StreamContext,
    batchSize: number
  ): Promise<VcsRepoKey[]> {
    const result = await this.runFunctionInBatches(
      vcsRepoNames,
      fc,
      ctx,
      batchSize,
      this.getVCSRepositoriesFromNames.bind(this)
    );
    return result as VcsRepoKey[];
  }

  async getCICDArtifactFromCommitShaBatches(
    allCommitShas: Set<string>,
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<CicdArtifactKey[]> {
    const commitShas = Array.from(allCommitShas);
    const result = await this.runFunctionInBatches(
      commitShas,
      fc,
      ctx,
      100,
      this.getCICDArtifactsFromCommitShas.bind(this)
    );
    return result as CicdArtifactKey[];
  }

  async getAWSCicdArtifactsFromRepoNamesByBatches(
    allRepoNames: string[],
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<CicdArtifactKey[]> {
    const result = await this.runFunctionInBatches(
      allRepoNames,
      fc,
      ctx,
      100,
      this.getAWSCicdArtifactsFromNames.bind(this)
    );
    return result as CicdArtifactKey[];
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

  async getVCSMappingsFromGit(
    gitRepoNamesToUIDs: Record<string, string[]>,
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // Faros Client is passed in as an argument in case we want to change it in the future
    const vuln_data: DestinationRecord[] = [];
    const allRepoNames = Object.keys(gitRepoNamesToUIDs);
    const allRepoKeys = await this.getVCSRepositoriesFromNamesBatches(
      allRepoNames,
      fc,
      ctx,
      100
    );
    ctx.logger.info('repo Keys: ' + JSON.stringify(allRepoKeys));
    const repoNameToKey: Record<string, VcsRepoKey> = {};
    for (const repoKey of allRepoKeys) {
      repoNameToKey[repoKey.name] = repoKey;
    }
    for (const [repoName, uids] of Object.entries(gitRepoNamesToUIDs)) {
      const repoKey = repoNameToKey[repoName];
      if (repoKey) {
        for (const uid of uids) {
          const vulnKey = {
            uid: uid,
            source: this.source,
          };
          const vuln: GithubVulnerabilityData = this.gitUidsToVulns[uid];
          vuln_data.push({
            model: 'vcs_RepositoryVulnerability',
            record: {
              repository: repoKey,
              vulnerability: vulnKey,
              url: vuln.externalURL,
              dueAt: vuln.slaDeadline,
            },
          });
        }
      }
    }
    return vuln_data;
  }

  getAWSV2VulnStatusDetail(vuln: AWSV2VulnerabilityData): string {
    if (vuln.ignored?.ignoreReason) {
      return vuln.ignored.ignoreReason;
    } else {
      return '';
    }
  }

  getAWSV2VulnStatusCategory(vuln: AWSV2VulnerabilityData): string {
    if (vuln.ignored?.ignoreReason) {
      return 'Ignored';
    } else if (vuln.ignored?.ignoredUntil) {
      return 'Ignored';
    } else {
      return 'Open';
    }
  }

  async getCICDMappingsFromAWS(
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // We iterate through the key-value pairs of awsUidsToVulns
    // We get the repository name from the vuln, and we take the most
    // recent cicd_Artifact, rather than getting the cicd_Artifact by commit sha
    // Faros Client is passed in as an argument in case we want to change it in the future
    const res: DestinationRecord[] = [];
    const repoNames: Set<string> = new Set();
    const uidsToRepoNames: Record<string, string> = {};
    for (const [uid, vuln] of Object.entries(this.awsUidsToVulns)) {
      let repoName = vuln.repositoryName;
      if (!repoName) {
        ctx.logger.debug(
          `Could not find repository name for vulnerability with uid "${uid}"`
        );
        this.vulnerabilitiesWithMissingRepositoryNames.add(uid);
        continue;
      }
      // If repoName has '/' in it, we split by backslash and take the last piece:
      if (repoName.includes('/')) {
        const split = repoName.split('/');
        repoName = split[split.length - 1];
      }
      repoNames.add(repoName);
      uidsToRepoNames[uid] = repoName;
    }
    const repoKeys: CicdArtifactKey[] =
      await this.getAWSCicdArtifactsFromRepoNamesByBatches(
        Array.from(repoNames),
        fc,
        ctx
      );
    const repoNamesToKeys: Record<string, CicdArtifactKey> = {};
    for (const repoKey of repoKeys) {
      repoNamesToKeys[repoKey.repository.uid] = repoKey;
    }
    for (const [uid, vuln] of Object.entries(this.awsUidsToVulns)) {
      const repoName = uidsToRepoNames[uid];
      const repoKey = repoNamesToKeys[repoName];
      res.push({
        model: 'cicd_ArtifactVulnerability',
        record: {
          artifact: repoKey,
          vulnerability: {
            uid: uid,
            source: this.source,
          },
          url: vuln.externalURL,
          dueAt: vuln.slaDeadline,
          createdAt: vuln.createdAt,
          acknowledgedAt: vuln.createdAt,
        },
      });
    }
    return res;
  }

  getCommitShasFromAWSV2Vulns(
    vulns: AWSV2VulnerabilityData[],
    ctx: StreamContext
  ): [Set<string>, Record<string, AWSV2VulnerabilityData>] {
    const seenUids: Set<string> = new Set();
    const allCommitShas: Set<string> = new Set();
    const commitShasToVulns: Record<string, AWSV2VulnerabilityData> = {};
    const vulnTitlesWithNoCommitShas: Set<string> = new Set();
    let totalMissed = 0;
    for (const vuln of vulns) {
      // First we check for dup uids
      const uid = this.getUidFromAWSV2Vuln(vuln);
      const title = vuln.displayName ? vuln.displayName : uid;
      if (seenUids.has(uid)) {
        ctx.logger.debug('Found duplicate vuln id: ' + uid);
        this.duplicateAwsUids.add(uid);
        continue;
      }
      seenUids.add(uid);

      // We need to do the following for each vuln:
      // Get the image tags. For each image tag, check if it is a github commit sha
      // If you get the github commit sha, query the cicd_Artifact table by commit sha
      // If you get a cicd_Artifact, add the mapping to the cicd_ArtifactVulnerability table
      const imageTags = vuln.imageTags;
      if (!imageTags || imageTags.length === 0) {
        totalMissed += 1;
        vulnTitlesWithNoCommitShas.add(title);
        continue;
      }
      let commitSha = null;
      for (const tag of imageTags) {
        if (looksLikeGithubCommitSha(tag)) {
          commitSha = tag;
          break;
        }
      }
      if (!commitSha) {
        totalMissed += 1;
        vulnTitlesWithNoCommitShas.add(title);
        continue;
      }
      allCommitShas.add(commitSha);
      commitShasToVulns[commitSha] = vuln;
    }
    ctx.logger.debug(
      `Missed getting commit shas for the following titles (or uid if title is missing): ${Array.from(
        vulnTitlesWithNoCommitShas
      )}. `
    );
    ctx.logger.info(
      `For commit shas, total missed: ${totalMissed}, total vulns: ${vulns.length}`
    );
    return [allCommitShas, commitShasToVulns];
  }

  async getCICDMappingsFromAWSV2(
    aws_vulns: AWSV2VulnerabilityData[],
    fc: FarosClient,
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // Faros Client is passed in as an argument in case we want to change it in the future
    const [allCommitShas, commitShasToVulns] = this.getCommitShasFromAWSV2Vulns(
      aws_vulns,
      ctx
    );
    const cicdArtifactKeys = await this.getCICDArtifactFromCommitShaBatches(
      allCommitShas,
      fc,
      ctx
    );
    const commitShaToArtifact: Record<string, CicdArtifactKey> = {};
    for (const artifact of cicdArtifactKeys) {
      commitShaToArtifact[artifact.uid] = artifact;
    }
    const res = [];
    for (const commitSha of allCommitShas) {
      const CicdArtifactKey = commitShaToArtifact[commitSha];
      if (CicdArtifactKey) {
        const vuln = commitShasToVulns[commitSha];
        res.push({
          model: 'cicd_ArtifactVulnerability',
          record: {
            artifact: CicdArtifactKey,
            vulnerability: {
              uid: this.getUidFromAWSV2Vuln(vuln),
              source: this.source,
            },
            url: vuln.externalURL,
            dueAt: vuln.remediateBy,
            createdAt: vuln.createdAt,
            acknowledgedAt: vuln.createdAt,
            status: {
              category: this.getAWSV2VulnStatusCategory(vuln),
              detail: this.getAWSV2VulnStatusDetail(vuln),
            },
          },
        });
      }
    }
    return res;
  }

  getUidFromAWSV2Vuln(vuln: AWSV2VulnerabilityData): string {
    // We keep the uid retreival in this function because if we choose to modify
    // the uid in the future, it will remain consistent in all cases.
    return vuln.uid;
  }

  getVulnRecordsFromAwsV2(data: AWSV2VulnerabilityData[]): DestinationRecord[] {
    const vuln_data = [];
    for (const vuln of data) {
      if (!vuln.uid) {
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      const sev: number = this.severityMap[vuln.severity];
      let sevString: string;
      if (!sev) {
        sevString = 'UNKNOWN';
      } else {
        sevString = sev.toString();
      }
      const uid = this.getUidFromAWSV2Vuln(vuln);
      const vuln_copy: ExtendedVulnerabilityType = {
        uid,
        createdAt: vuln.createdAt,
        externalURL: vuln.externalURL,
        severity: sevString,
        description: vuln.description,
        displayName: vuln.displayName,
      };

      vuln_data.push(this.getSecVulnerabilityRecordFromData(vuln_copy));
    }
    return vuln_data;
  }

  combineAwsVulns(
    aws_v1_vulns: DestinationRecord[],
    aws_v2_vulns: DestinationRecord[],
    ctx: StreamContext
  ): DestinationRecord[] {
    const seenUids: Set<string> = new Set();
    const combined = [];

    for (const vuln_list of [aws_v2_vulns, aws_v1_vulns]) {
      for (const vuln of vuln_list) {
        if (!seenUids.has(vuln.record.uid)) {
          combined.push(vuln);
          seenUids.add(vuln.record.uid);
        } else {
          ctx.logger.info('Found duplicate vuln id: ' + vuln.record.uid);
          this.duplicateAwsUids.add(vuln.record.uid);
        }
      }
    }

    return combined;
  }

  getSecVulnerabilityRecordFromData(
    data: ExtendedVulnerabilityType
  ): DestinationRecord {
    // The essential fields (ones which cannot be null) are uid and source
    if (!data.uid || !this.source) {
      throw new Error(
        'Vulnerability data must have a uid and source. Data: ' +
          JSON.stringify(data) +
          JSON.stringify(data.uid)
      );
    }
    return {
      model: 'sec_Vulnerability',
      record: {
        uid: data.uid,
        source: this.source,
        title: data.displayName,
        description: data.description,
        severity: data.severity,
        url: data.externalURL,
        discoveredAt: data.createdAt,
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
    return (
      this.git_vulns.length + this.aws_vulns.length + this.awsv2_vulns.length
    );
  }

  async getPaginatedQueryResults(
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
  ): Promise<VulnerabilityInfo[]> {
    const resp_list = await this.getPaginatedQueryResults(ctx, query, key);
    const res = [];
    for (const item of resp_list) {
      res.push({
        id: item.id,
        vulnerabilityUid: item?.vulnerability?.uid,
        resolvedAt: item.resolvedAt,
      });
    }
    return res;
  }

  async updateVulnsInBatches(
    ctx: StreamContext,
    ids: string[],
    resolvedAt: string,
    mutationName: string,
    updateName: string,
    updatesPerRequest: number
  ): Promise<void> {
    // We iterate over the ids in batches of size updatesPerRequest and update them in the graph
    for (let i = 0; i < ids.length; i += updatesPerRequest) {
      let mutationString = `mutation ${mutationName}{`;
      for (let j = i; j < Math.min(i + updatesPerRequest, ids.length); j++) {
        mutationString += `  update${j}: ${updateName}(where: {id: {_eq: "${ids[j]}"}} _set: {resolvedAt: "${resolvedAt}"}) {affected_rows} `;
      }
      mutationString += '}';
      ctx.logger.debug(`Mutation string: ${mutationString}`);
      await ctx.farosClient.gql(ctx.graph, mutationString, {});
      // Sleep for 1 second to avoid overloading
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async updateVCSVulnsToResolved(ctx: StreamContext): Promise<number> {
    const allUnresolvedVcsRepositoryVulnerabilities: VulnerabilityInfo[] =
      await this.getAllUnresolvedObjectVulnerabilities(
        ctx,
        this.vcsRepositoryVulnerabilityQuery,
        'vcs_RepositoryVulnerability'
      );
    const allActiveVulnUids: Set<string> = new Set(
      Object.keys(this.gitUidsToVulns)
    );
    const idsToUpdateToResolved = [];
    for (const unresolvedVuln of allUnresolvedVcsRepositoryVulnerabilities) {
      const uid = unresolvedVuln.vulnerabilityUid;
      if (!allActiveVulnUids.has(uid)) {
        if (!unresolvedVuln.id) {
          throw new Error('Unresolved vulnerability does not have an id');
        }
        // We need to update the vulnerability to be resolved
        idsToUpdateToResolved.push(unresolvedVuln.id);
      }
    }
    ctx.logger.debug(
      `Out of ${allUnresolvedVcsRepositoryVulnerabilities.length} unresolved repo vulnerabilities, ${idsToUpdateToResolved.length} are not in the current set of vulnerabilities.`
    );
    // We update the vulnerabilities to be resolved
    const nowDate = new Date().toISOString();
    await this.updateVulnsInBatches(
      ctx,
      idsToUpdateToResolved,
      nowDate,
      'UpdateVulnerabilities',
      'update_vcs_RepositoryVulnerability',
      10
    );
    return idsToUpdateToResolved.length;
  }

  async updateCICDVulnsToResolved(ctx: StreamContext): Promise<number> {
    const allUnresolvedCicdArtifactVulnerabilities: VulnerabilityInfo[] =
      await this.getAllUnresolvedObjectVulnerabilities(
        ctx,
        this.cicdArtifactVulnerabilityQuery,
        'cicd_ArtifactVulnerability'
      );
    const allActiveVulnUids: Set<string> = new Set(
      Object.keys(this.awsUidsToVulns)
    );
    const idsToUpdateToResolved = [];
    for (const unresolvedVuln of allUnresolvedCicdArtifactVulnerabilities) {
      const uid = unresolvedVuln.vulnerabilityUid;
      if (!allActiveVulnUids.has(uid)) {
        // We need to update the vulnerability to be resolved
        idsToUpdateToResolved.push(unresolvedVuln.id);
      }
    }
    ctx.logger.debug(
      `Out of ${allUnresolvedCicdArtifactVulnerabilities.length} unresolved artifact vulnerabilities, ${idsToUpdateToResolved.length} are not in the current set of vulnerabilities.`
    );
    // We update the vulnerabilities to be resolved
    const nowDate = new Date().toISOString();
    await this.updateVulnsInBatches(
      ctx,
      idsToUpdateToResolved,
      nowDate,
      'UpdateVulnerabilities',
      'update_cicd_ArtifactVulnerability',
      10
    );
    return idsToUpdateToResolved.length;
  }

  async updateExistingVulnerabilities(ctx: StreamContext): Promise<void> {
    // We want to observe the current vulnerabilities from the faros graph and update them
    // in batches. This means we get all the unresolved vulnerabilities from the graph
    // and check if they exist in the current set of vulnerabilities coming from the source.
    // If they do not, we update the vulnerabilities 'resolvedAt' field to the current time.
    this.nUpdatedVcsVulns = await this.updateVCSVulnsToResolved(ctx);
    this.nUpdatedCicdVulns = await this.updateCICDVulnsToResolved(ctx);
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    // We'll need to grab vcs and cicd data from the graph to match the vulns
    // to the correct parts
    const total_vulns_to_process = this.getTotalNumberOfRecords();
    ctx.logger.debug(
      'Running onProcessing Complete. Total number of records to process: ' +
        total_vulns_to_process
    );
    const res = [];
    // Getting sec_Vulnerability records
    res.push(...this.getVulnRecordsFromGit(this.git_vulns));
    const aws_v1_vulns = this.getVulnRecordsFromAws(this.aws_vulns);
    const aws_v2_vulns = this.getVulnRecordsFromAwsV2(this.awsv2_vulns);
    const combined_aws_vulns = this.combineAwsVulns(
      aws_v1_vulns,
      aws_v2_vulns,
      ctx
    );
    res.push(...combined_aws_vulns);

    // In the following functions we query Faros for the related VCS and CICD data.
    // Each vuln needs to be associated with either a VCS repository or a CICD artifact.

    if (!ctx.farosClient) {
      throw new Error('Faros client not found in context');
    }

    // Getting vcs_RepositoryVulnerability records
    const vcsMappings = await this.getVCSMappingsFromGit(
      this.repositoryNamesToUids,
      ctx.farosClient,
      ctx
    );
    res.push(...vcsMappings);

    // Getting cicd_ArtifactVulnerability records
    const cicdArtifactMappingsAWSV2 = await this.getCICDMappingsFromAWSV2(
      this.awsv2_vulns,
      ctx.farosClient,
      ctx
    );
    res.push(...cicdArtifactMappingsAWSV2);

    const cicdArtifactMappingsAWS = await this.getCICDMappingsFromAWS(
      ctx.farosClient,
      ctx
    );
    res.push(...cicdArtifactMappingsAWS);

    await this.updateExistingVulnerabilities(ctx);

    this.printReport(ctx);
    return res;
  }
}
