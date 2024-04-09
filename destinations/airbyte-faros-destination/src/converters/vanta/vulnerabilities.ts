import {AirbyteRecord} from 'faros-airbyte-cdk';

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
  GithubVulnerabilityData,
  VcsRepoKey,
} from './types';
import {getQueryFromName} from './utils';

export function looksLikeGithubCommitSha(sha: string): boolean {
  return /^[a-f0-9]{40}$/i.test(sha);
}

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

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.vuln_data?.id;
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
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      vuln['description'] = vuln.vantaDescription;
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
    const vuln_data = [];
    for (const vuln of data) {
      if (!vuln.uid) {
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      for (const finding of vuln.findings) {
        // We copy vuln data and add the finding data to it
        const new_vuln = {...vuln};
        const cve_str = finding['name'];
        const uid_addition = '|' + cve_str.split(' ')[0];
        new_vuln.uid += uid_addition;
        new_vuln['description'] = finding['description'];
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

  async getVCSRepositoryFromName(
    vcsRepoName: string,
    ctx: StreamContext
  ): Promise<VcsRepoKey | null> {
    if (ctx.farosClient) {
      const resp = await ctx.farosClient.gql(
        ctx.graph,
        this.vcsRepositoryQuery,
        {repoName: vcsRepoName}
      );
      if (!resp) {
        ctx.logger.info(
          `Did not get any results for vcsRepository query with name "${vcsRepoName}"`
        );
        return null;
      }
      const results = resp?.vcs_Repository;
      let result = null;
      if (results.length > 0) {
        result = results[0];
      } else {
        ctx.logger.info(
          `Did not get any results for vcsRepository query with name "${vcsRepoName}"`
        );
      }
      return result;
    }
    return null;
  }

  async getCICDArtifactFromCommitSha(
    commitSha: string,
    ctx: StreamContext
  ): Promise<CicdArtifactKey | null> {
    if (ctx.farosClient) {
      const resp = await ctx.farosClient.gql(
        ctx.graph,
        this.cicdArtifactQueryByCommitSha,
        {commitSha}
      );
      if (!resp) {
        ctx.logger.info(
          `Did not get any results for cicdArtifact query with commit sha "${commitSha}"`
        );
        return null;
      }
      const results = resp?.cicd_Artifact;
      let result = null;
      if (results.length > 0) {
        result = results[0];
      } else {
        ctx.logger.info(
          `Did not get any results for cicdArtifact query with commit sha "${commitSha}"`
        );
      }
      return result;
    }
    return null;
  }

  async getAWSCicdArtifactFromName(
    repoName: string,
    ctx: StreamContext
  ): Promise<CicdArtifactKey | null> {
    // Because we don't have the actual commit sha, we can't query the cicd_Artifact table
    // using the uid. Instead, we'll need to query the cicd_Artifact table using the repository name
    // and choosing the most recent artifact.

    if (ctx.farosClient) {
      const resp = await ctx.farosClient.gql(
        ctx.graph,
        this.cicdArtifactQueryByRepoName,
        {repoName}
      );
      if (!resp) {
        ctx.logger.info(
          `Did not get any results for cicdArtifact query with repository name "${repoName}"`
        );
        return null;
      }
      const results = resp?.cicd_Artifact;
      let result = null;
      if (results.length > 0) {
        result = results[0];
      } else {
        ctx.logger.info(
          `Did not get any results for cicdArtifact query with repository name "${repoName}"`
        );
      }
      return result;
    }
  }

  async getVCSMappingsFromGit(
    gitRepoNamesToUIDs: Record<string, string[]>,
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    const vuln_data: DestinationRecord[] = [];
    for (const [repoName, uids] of Object.entries(gitRepoNamesToUIDs)) {
      const repoKey = await this.getVCSRepositoryFromName(repoName, ctx);
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
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    // We iterate through the key-value pairs of awsUidsToVulns
    // We get the repository name from the vuln, and we take the most
    // recent cicd_Artifact, rather than getting the cicd_Artifact by commit sha
    const res: DestinationRecord[] = [];
    for (const [uid, vuln] of Object.entries(this.awsUidsToVulns)) {
      let repoName = vuln.repositoryName;
      if (!repoName) {
        ctx.logger.info(
          `Could not find repository name for vulnerability with uid "${uid}"`
        );
        continue;
      }
      // If repoName has '/' in it, we split by backslash and take the last piece:
      if (repoName.includes('/')) {
        const split = repoName.split('/');
        repoName = split[split.length - 1];
      }
      const repoKey = await this.getAWSCicdArtifactFromName(repoName, ctx);
      if (!repoKey) {
        ctx.logger.info(
          `Could not find cicd_Artifact for vulnerability with uid "${uid}"`
        );
        continue;
      }
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

  async getCICDMappingsFromAWSV2(
    aws_vulns: AWSV2VulnerabilityData[],
    ctx: StreamContext
  ): Promise<DestinationRecord[]> {
    const res = [];
    const seenUids: Set<string> = new Set();
    for (const vuln of aws_vulns) {
      // First we check for dup uids
      const uid = this.getUidFromAWSV2Vuln(vuln);
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
        ctx.logger.debug(
          `Skipped getting commit Sha from below imageTags due to not finding git commit sha:` +
            JSON.stringify(imageTags)
        );
        continue;
      }

      const CicdArtifactKey = await this.getCICDArtifactFromCommitSha(
        commitSha,
        ctx
      );
      if (CicdArtifactKey) {
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
        displayName: vuln.asset.displayName,
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

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
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

  printReport(ctx: StreamContext): void {
    const report_obj = {
      nVulnsMissingIds: this.vulnsMissingIds.length,
      nDuplicateAwsUids: this.duplicateAwsUids.size,
    };
    ctx.logger.info(
      'Vulnerabilities converter report: \n' +
        JSON.stringify(report_obj, null, 2)
    );
    if (this.vulnsMissingIds.length > 0) {
      ctx.logger.debug(
        'Vulnerabilities missing ids: \n' +
          JSON.stringify(this.vulnsMissingIds, null, 2)
      );
    }
    if (this.duplicateAwsUids.size > 0) {
      ctx.logger.debug(
        'Duplicate AWS vuln uids: \n' +
          JSON.stringify(this.duplicateAwsUids, null, 2)
      );
    }
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    // We'll need to grab vcs and cicd data from the graph to match the vulns
    // to the correct parts
    ctx.logger.debug('Running onProcessing complete');
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

    // Getting vcs_RepositoryVulnerability records
    const vcsMappings = await this.getVCSMappingsFromGit(
      this.repositoryNamesToUids,
      ctx
    );
    res.push(...vcsMappings);

    // Getting cicd_ArtifactVulnerability records
    const cicdArtifactMappingsAWSV2 = await this.getCICDMappingsFromAWSV2(
      this.awsv2_vulns,
      ctx
    );
    res.push(...cicdArtifactMappingsAWSV2);
    const cicdArtifactMappingsAWS = await this.getCICDMappingsFromAWS(ctx);
    res.push(...cicdArtifactMappingsAWS);
    this.printReport(ctx);
    return res;
  }
}
