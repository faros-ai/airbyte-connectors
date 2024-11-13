import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  Vulnerability,
  VulnerabilityRemediation,
} from 'faros-airbyte-common/vanta';
import {Utils} from 'faros-js-client';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {CicdArtifactKey, VcsRepoKey} from './types';
import {getQueryFromName} from './utils';

const MAX_DESCRIPTION_LENGTH = 1000;

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
  ];
  severityMap: {[key: string]: number} = {
    LOW: 3.0,
    MEDIUM: 6.0,
    HIGH: 9.0,
    CRITICAL: 10.0,
  };
  vcsRepositoryQuery = getQueryFromName('vcsRepositoryQuery');
  cicdArtifactQueryByCommitSha = getQueryFromName(
    'cicdArtifactQueryByCommitSha'
  );
  secVulnerabilityQuery = getQueryFromName('secVulnerabilityQuery');

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
          this.maxDescriptionLength(ctx)
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

    // If the vulnerability has repo name but no image tag,
    // we assume it is a VCS vulnerability and search for the related repository
    if (data.repoName && !data.imageTag) {
      const vcsRepo = await this.getVCSRepositoryFromName(data.repoName, ctx);
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
    } else if (data.imageTag) {
      const cicdArtifact = await this.getCICDArtifactImageTag(
        data.imageTag,
        ctx
      );
      const artifactVulnerabilityRecord: DestinationRecord = {
        model: 'cicd_ArtifactVulnerability',
        record: {
          vulnerability: {uid: data.id, source: this.source},
          artifact: cicdArtifact,
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
        `Did not get any results for vcs_Repository query with name "${vcsRepoName}"`
      );
      return null;
    }
    if (results.length > 1) {
      ctx.logger.warn(
        `Got more than one result for vcs_Repository query with name "${vcsRepoName}, using the first one"`
      );
    }
    return results[0];
  }

  async getCICDArtifactImageTag(
    commitSha: string,
    ctx: StreamContext
  ): Promise<CicdArtifactKey | null> {
    const result = await ctx.farosClient.gql(
      ctx.graph,
      this.cicdArtifactQueryByCommitSha,
      {
        commitSha,
      }
    );
    const results = result?.cicd_Artifact;
    if (!results || results.length === 0) {
      ctx.logger.debug(
        `Did not get any results for cicd_Artifact query with commit sha "${commitSha}"`
      );
      return null;
    }
    if (results.length > 1) {
      ctx.logger.warn(
        `Got more than one result for cicd_Artifact query with name "${commitSha}, using the first one"`
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

  private maxDescriptionLength(ctx: StreamContext): number {
    return ctx.config.max_description_lenght || MAX_DESCRIPTION_LENGTH;
  }
}
