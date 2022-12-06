import {AirbyteLogger, AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  ARTIFACT_TYPE,
  CICDTag,
  DockerCommon,
  DockerConverter,
  OrganizationKey,
  RepositoryKey,
  Tag,
} from './common';

export class Tags extends DockerConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_Organization',
    'cicd_Repository',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const tag = record.record.data as Tag;
    const res: DestinationRecord[] = [];

    const org = this.organization(ctx);

    if (!org) {
      return res;
    }

    const organizationKey: OrganizationKey = {
      uid: org.toLowerCase(),
      source,
    };
    res.push({
      model: 'cicd_Organization',
      record: {
        ...organizationKey,
        name: org,
      },
    });
    const [repoName] = tag.projectName.toLowerCase().split('/').slice(-1);
    const repositoryKey: RepositoryKey = {
      uid: repoName.toLowerCase(),
      organization: organizationKey,
    };
    res.push({
      model: 'cicd_Repository',
      record: {
        ...repositoryKey,
        name: repoName,
      },
    });

    const cicdTags: CICDTag[] = [];
    const imageInfo = `(${tag.projectName}:${tag.name})`;

    if (
      tag.imageManifest?.schemaVersion !==
      DockerCommon.ALLOWED_MANIFEST_SCHEMA_VERSION
    ) {
      ctx.logger.info(
        `Image schema version is not supported: ${tag.imageManifest.schemaVersion} != expected ${DockerCommon.ALLOWED_MANIFEST_SCHEMA_VERSION} ${imageInfo}`
      );
      return res;
    }

    if (tag.imageConfig.config.Labels) {
      Object.entries(tag.imageConfig.config.Labels).forEach(([name, value]) => {
        cicdTags.push({name, value});
      });
    }

    const skipTags = this.skipTags(ctx);
    if (!skipTags || !skipTags.includes(tag.name)) {
      const labelPrefix = this.labelPrefix(ctx);
      const buildKey = DockerCommon.getBuildKey(cicdTags, labelPrefix);
      const commitKey = DockerCommon.getCommitKey(cicdTags, labelPrefix);
      res.push({
        model: 'cicd_Artifact',
        record: {
          uid: tag.name,
          name: tag.name,
          type: ARTIFACT_TYPE,
          createdAt: Utils.toDate(tag.imageConfig.created),
          build: buildKey,
          tags: cicdTags,
          repository: repositoryKey,
        },
      });

      if (commitKey) {
        res.push({
          model: 'cicd_ArtifactCommitAssociation',
          record: {
            artifact: {
              uid: tag.name,
              repository: repositoryKey,
            },
            commit: commitKey,
          },
        });
      }
    } else {
      ctx.logger.info(
        `Skipped artifact in repo ${repositoryKey.uid} (uid: ${tag.name})`
      );
    }

    return res;
  }
}
