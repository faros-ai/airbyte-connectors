import {AirbyteRecord} from 'faros-airbyte-cdk';
import {replace} from 'lodash';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {vcsRepositoryQuery} from './queries';
import {
  AWSV2VulnerabilityData,
  AWSVulnerabilityData,
  ExtendedVulnerabilityType,
  GithubVulnerabilityData,
  vcsRepoKey,
} from './types';

/** Trello converter base */
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

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.vuln_data?.id;
  }

  addRepositoryNameToUID(name: string, uid: string) {
    if (name in this.repositoryNamesToUids) {
      this.repositoryNamesToUids[name].push(uid);
    } else {
      this.repositoryNamesToUids[name] = [uid];
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
      this.addRepositoryNameToUID(vuln.repositoryName, vuln.uid);
      vuln_data.push(
        this.getSecVulnerabilityRecordFromData(
          vuln as ExtendedVulnerabilityType
        )
      );
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
      }
    }
    return vuln_data;
  }

  async getVCSRepositoryFromName(
    vcsRepoName: string,
    ctx: StreamContext
  ): Promise<vcsRepoKey | null> {
    const replacedQuery = vcsRepositoryQuery.replace('<REPONAME>', vcsRepoName);
    if (ctx.farosClient) {
      const resp = await ctx.farosClient.gql(ctx.graph, replacedQuery);
      const results = resp?.vcs_Repository;
      let result = null;
      if (results.length > 0) {
        result = results[0];
      } else {
        ctx.logger.warn(
          `Did not get any results for vcsRepository query with name "${vcsRepoName}"`
        );
      }
      return result;
    }
    return null;
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
          vuln_data.push({
            model: 'vcs_RepositoryVulnerability',
            record: {
              repository: repoKey,
              vulnerability: vulnKey,
            },
          });
        }
      }
    }
    return vuln_data;
  }

  getVulnRecordsFromAwsV2(data: AWSV2VulnerabilityData[]): DestinationRecord[] {
    const vuln_data = [];
    for (const vuln of data) {
      if (!vuln.uid) {
        this.vulnsMissingIds.push(vuln);
        continue;
      }
      const sev: number = this.severityMap[vuln.severity];
      const vuln_copy: ExtendedVulnerabilityType = {
        uid: vuln.uid,
        createdAt: vuln.createdAt,
        externalURL: vuln.externalURL,
        severity: sev.toString(),
        description: vuln.description,
        displayName: vuln.asset.displayName,
      };
      vuln_data.push(this.getSecVulnerabilityRecordFromData(vuln_copy));
    }
    return vuln_data;
  }

  combineAwsVulns(
    aws_v1_vulns: DestinationRecord[],
    aws_v2_vulns: DestinationRecord[]
  ): DestinationRecord[] {
    const seenUids = new Set();
    const combined = [];
    for (const vuln of aws_v2_vulns) {
      if (!seenUids.has(vuln.record.uid)) {
        combined.push(vuln);
        seenUids.add(vuln.record.uid);
      }
    }
    for (const vuln of aws_v1_vulns) {
      if (!seenUids.has(vuln.record.uid)) {
        combined.push(vuln);
        seenUids.add(vuln.record.uid);
      } else {
        // TODO: Update this to be logged to the logger
        console.log('Found duplicate vuln id: ' + vuln.record.uid);
      }
    }
    return combined;
  }

  getVulnerabilityIdsFromData(data: any): string[] {
    // TODO: implement
    return [];
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
    const combined_aws_vulns = this.combineAwsVulns(aws_v1_vulns, aws_v2_vulns);
    res.push(...combined_aws_vulns);
    // Getting vcs_RepositoryVulnerability records
    // TODO
    const vcsMappings = await this.getVCSMappingsFromGit(
      this.repositoryNamesToUids,
      ctx
    );
    res.push(...vcsMappings);

    // Getting cicd_ArtifactVulnerability records
    // TODO
    return res;
  }
}
