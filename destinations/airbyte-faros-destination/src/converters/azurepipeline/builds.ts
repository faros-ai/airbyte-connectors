import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Build, Tag} from 'faros-airbyte-common/azurepipeline';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzurePipelineConverter} from './common';

export class Builds extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Artifact',
    'cicd_ArtifactCommitAssociation',
    'cicd_Build',
    'cicd_BuildStep',
    'cicd_BuildCommitAssociation',
    'cicd_Repository',
  ];

  private seenRepositories = new Set<string>();

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const build = record.record.data as Build;
    const uid = String(build.id);

    const organizationName = this.getOrganizationFromUrl(build.url);
    if (!organizationName) {
      return [];
    }

    const pipelineKey = {
      uid: String(build.definition?.id),
      organization: {uid: organizationName, source},
    };

    const buildKey = {uid, pipeline: pipelineKey};
    const createdAt = Utils.toDate(build.queueTime);
    const startedAt = Utils.toDate(build.startTime);
    const endedAt = Utils.toDate(build.finishTime);
    const status = this.convertBuildState(build.result);
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Build',
      record: {
        ...buildKey,
        name: build.buildNumber,
        createdAt,
        startedAt,
        endedAt,
        status,
        url: build.url,
      },
    });

    if (build.sourceVersion && build.repository) {
      const vcsRepository = this.vcs_Repository(build.repository);
      const commitKey = {
        sha: build.sourceVersion,
        repository: vcsRepository,
      };
      if (vcsRepository) {
        res.push({
          model: 'cicd_BuildCommitAssociation',
          record: {
            build: buildKey,
            commit: commitKey,
          },
        });
      }

      const cicdRepoUid = `${build.repository.type}:${build.repository.id}`;
      const cicdRepoKey = {
        uid: cicdRepoUid,
        organization: {uid: organizationName, source},
      };
      if (!this.seenRepositories.has(cicdRepoUid)) {
        this.seenRepositories.add(cicdRepoUid);
        res.push({
          model: 'cicd_Repository',
          record: {
            ...cicdRepoKey,
            name: build.repository.name,
            description: null,
            url: build.repository.url,
          },
        });
      }

      for (const artifact of build.artifacts) {
        const tags: Tag[] = [];
        for (const [key, value] of Object.entries(
          artifact.resource.properties
        )) {
          tags.push({name: key, value: String(value)});
        }
        const artifactKey = {
          uid: String(artifact.id),
          repository: cicdRepoKey,
        };
        res.push({
          model: 'cicd_Artifact',
          record: {
            ...artifactKey,
            name: artifact.name,
            url: artifact.resource.url,
            type: artifact.resource.type,
            createdAt: endedAt,
            tags,
            build: buildKey,
          },
        });
        if (vcsRepository) {
          res.push({
            model: 'cicd_ArtifactCommitAssociation',
            record: {
              artifact: artifactKey,
              commit: commitKey,
            },
          });
        }
      }
    }

    for (const job of build.jobs) {
      const jobCreatedAt = Utils.toDate(job.startTime);
      const jobStartedAt = Utils.toDate(job.startTime);
      const jobEndedAt = Utils.toDate(job.finishTime);
      const jobStatus = this.convertBuildStepState(job.result);
      const jobType = this.convertBuildStepType(job.type);

      res.push({
        model: 'cicd_BuildStep',
        record: {
          uid: String(job.id),
          build: buildKey,
          name: job.name,
          command: job.name,
          type: jobType,
          createdAt: jobCreatedAt,
          startedAt: jobStartedAt,
          endedAt: jobEndedAt,
          status: jobStatus,
          url: job.url,
        },
      });
    }

    return res;
  }
}
