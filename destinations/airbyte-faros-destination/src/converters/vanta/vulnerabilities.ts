import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosClient, Utils} from 'faros-js-client';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {
  AWSV2VulnerabilityData,
  CicdArtifactKey,
  ExtendedVulnerabilityType,
  GitV2VulnerabilityData,
  VcsRepoKey,
  Vulnerability,
  VulnerabilityRemediation,
} from './types';
import {getQueryFromName} from './utils';

export abstract class Vulnerabilities extends Converter {
  source = 'vanta';
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'sec_Vulnerability',
    'sec_VulnerabilityIdentifier',
    'sec_VulnerabilityIdentifierRelationship',
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
  secVulnerabilityQuery = getQueryFromName('secVulnerabilityQuery');
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
  maxNRecords: number | null = 100; // TODO: remove this config
  filterLastNDays: number | null = null; // TODO: move this config to the source
  maxDescriptionLength: number = 1000; // TODO: Add config parameter
  vcsIntegrationIds = ['github']; // TODO: Receive this from config
  cicdIntegrationIds = ['aws']; // TODO: Receive this from config

  /** All Vanta records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.data.id;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const recordType = record?.record?.data?.recordType;
    if (recordType === 'vulnerability') {
      return this.convertVulnerabilityRecord(record?.record?.data.data, ctx);
    } else if (recordType === 'vulnerability-remediation') {
      return this.convertVulnerabilityRemediationRecord(
        record?.record?.data.data,
        ctx
      );
    }
    ctx.logger.warn(
      'Skipping vulnerability stream record. Unknown record type: ' + recordType
    );
    return [];
  }

  async convertVulnerabilityRecord(
    data: Vulnerability,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const records: DestinationRecord[] = [];

    // Creating the base sec_Vulnerability record
    const vulnRecord: DestinationRecord = {
      model: 'sec_Vulnerability',
      record: {
        uid: data.id,
        source: this.source,
        title: data.name,
        description: Utils.cleanAndTruncate(
          data.description,
          this.maxDescriptionLength
        ),
        severity: data.severity
          ? this.severityMap[data.severity].toString()
          : '0',
        url: data.externalURL,
        discoveredAt: this.convertDateFormat(data.firstDetectedDate),
        vulnerabilityIds: data.relatedVulns,
      },
    };
    records.push(vulnRecord);

    const identifier = data.name;
    const category = this.getVulnerabilityCatalogCategory(identifier);
    const type = {category, detail: category};
    const identifierRecord: DestinationRecord = {
      model: 'sec_VulnerabilityIdentifier',
      record: {
        uid: identifier,
        type,
      },
    };
    records.push(identifierRecord);

    const identifierRelationshipRecord: DestinationRecord = {
      model: 'sec_VulnerabilityIdentifierRelationship',
      record: {
        vulnerability: {uid: data.id, source: this.source},
        identifier: {uid: identifier, type},
      },
    };
    records.push(identifierRelationshipRecord);

    // Creating repository or CICD artifact vulnerability records based on vulnerability type
    if (this.vcsIntegrationIds.includes(data.integrationId)) {
      const vcsRepo = await this.getVCSRepositoryFromName(
        data.resourceName,
        ctx
      );
      const repoVulnerabilityRecord: DestinationRecord = {
        model: 'vcs_RepositoryVulnerability',
        record: {
          vulnerability: {uid: data.id, source: this.source},
          repository: vcsRepo,
          url: data.externalURL,
          dueAt: this.convertDateFormat(data.remediateByDate),
          createdAt: this.convertDateFormat(data.firstDetectedDate),
          status: {
            category: data.deactivateMetadata ? 'Ignored' : 'Open',
            detail: data.deactivateMetadata?.deactivationReason || '',
          },
        },
      };
      records.push(repoVulnerabilityRecord);
    } else if (this.cicdIntegrationIds.includes(data.integrationId)) {
      // TODO: query for cicd artifact based on artifact uid
      const artifactVulnerabilityRecord: DestinationRecord = {
        model: 'cicd_ArtifactVulnerability',
        record: {
          vulnerability: {uid: data.id, source: this.source},
          artifact: {
            uid: data.targetId, // This should be the artifact uid, and use the repo where the artifact is from
            repository: {uid: 'cicd-repo-uid', source: this.source},
          },
          url: data.externalURL,
          dueAt: this.convertDateFormat(data.remediateByDate),
          createdAt: this.convertDateFormat(data.firstDetectedDate),
          status: {
            category: data.deactivateMetadata ? 'Ignored' : 'Open',
            detail: data.deactivateMetadata?.deactivationReason || '',
          },
        },
      };
      records.push(artifactVulnerabilityRecord);
    }

    return records;
  }

  async getVCSRepositoryFromName(
    vcsRepoName: string,
    ctx: StreamContext
  ): Promise<VcsRepoKey | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.vcsRepositoryQuery,
      {
        vcsRepoName,
      }
    );
    const results = result?.vcs_Repository;
    if (!results || results.length === 0) {
      ctx.logger.debug(
        `Did not get any results for vcsRepository query with name "${vcsRepoName}"`
      );
      return null;
    }
    if (results.length > 1) {
      ctx.logger.warn(
        `Got more than one result for vcsRepository query with name "${vcsRepoName}, using the first one"`
      );
    }
    return results[0];
  }

  async convertVulnerabilityRemediationRecord(
    data: VulnerabilityRemediation,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const relatedEntity = await this.getVulnerabilityRelatedEntityById(
      data.vulnerabilityId,
      ctx
    );
    if (!relatedEntity) {
      ctx.logger.warn(
        `No related entity found for vulnerability id ${data.vulnerabilityId}`
      );
      return [];
    }
    if (relatedEntity.repository) {
      return [
        {
          model: 'vcs_RepositoryVulnerability__Update',
          record: {
            at: Date.now(),
            where: {
              vulnerability: {
                uid: data.vulnerabilityId,
                source: this.source,
              },
              repository: {
                name: relatedEntity.repository.name,
                organization: {
                  uid: relatedEntity.repository.organization.uid,
                  source: relatedEntity.repository.organization.source,
                },
              },
            },
            mask: ['resolvedAt', 'status'],
            patch: {
              resolvedAt: data.remediationDate,
              status: {
                category: 'Resolved',
                detail: 'Resolved',
              },
            },
          },
        },
      ];
    }
    if (relatedEntity.artifact) {
      return [
        {
          model: 'cicd_ArtifactVulnerability__Update',
          record: {
            at: Date.now(),
            where: {
              vulnerability: {
                uid: data.vulnerabilityId,
                source: this.source,
              },
              artifact: {
                uid: relatedEntity.artifact.uid,
                repository: {
                  uid: relatedEntity.artifact.repository.uid,
                  organization: {
                    uid: relatedEntity.artifact.repository.organization.uid,
                    source:
                      relatedEntity.artifact.repository.organization.source,
                  },
                },
              },
            },
            mask: ['resolvedAt', 'status'],
            patch: {
              resolvedAt: data.remediationDate,
              status: {
                category: 'Resolved',
                detail: 'Resolved',
              },
            },
          },
        },
      ];
    }
  }

  getVulnerabilityCatalogCategory(identifierId: string): string {
    if (identifierId.includes('CVE')) {
      return 'CVE';
    } else if (identifierId.includes('GHSA')) {
      return 'GHSA';
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

  /** Sec vulnerability has artifacts and repository relationship. When source is Vanta, each sec vulnerability will have only
   * one cicd artifact or vcs repository, as it represents a finding. **/
  async getVulnerabilityRelatedEntityById(
    id: string,
    ctx: StreamContext
  ): Promise<any> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.secVulnerabilityQuery,
      {id, source: this.source}
    );
    const artifacts = result?.sec_Vulnerability[0]?.artifacts;
    const repositories = result?.sec_Vulnerability[0]?.repositories;
    if (artifacts && artifacts.length > 0) {
      return artifacts[0];
    } else if (repositories && repositories.length > 0) {
      return repositories[0];
    }
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
}
