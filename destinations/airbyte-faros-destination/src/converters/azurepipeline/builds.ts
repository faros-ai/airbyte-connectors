import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {AzurePipelineConverter} from './common';
import {Build} from './models';

export class Builds extends AzurePipelineConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildStep',
    'cicd_BuildCommitAssociation',
  ];

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

    const pipeline = {
      uid: String(build.definition?.id),
      organization: {uid: organizationName, source},
    };

    const buildUid = {uid, pipeline};
    const createdAt = Utils.toDate(build.queueTime);
    const startedAt = Utils.toDate(build.startTime);
    const endedAt = Utils.toDate(build.finishTime);
    const status = this.convertBuildState(build.result);
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Build',
      record: {
        uid,
        name: build.buildNumber,
        createdAt,
        startedAt,
        endedAt,
        status,
        url: build.url,
        pipeline,
      },
    });

    if (build.sourceVersion && build.repository) {
      const repository = this.vcs_Repository(build.repository);
      if (repository) {
        res.push({
          model: 'cicd_BuildCommitAssociation',
          record: {
            build: {uid, pipeline},
            commit: {
              sha: build.sourceVersion,
              uid: build.sourceVersion,
              repository,
            },
          },
        });
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
          name: job.name,
          command: job.name,
          type: jobType,
          createdAt: jobCreatedAt,
          startedAt: jobStartedAt,
          endedAt: jobEndedAt,
          status: jobStatus,
          url: job.url,
          build: buildUid,
        },
      });
    }

    return res;
  }
}
