import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {CircleCICommon, CircleCIConverter} from './common';
import {Pipeline} from './models';

export class Pipelines extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
    'cicd_BuildStep',
  ];
  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    const res: DestinationRecord[] = [];

    for (const workflow of pipeline.workflows) {
      const buildKey = CircleCICommon.getBuildKey(workflow, pipeline, source);
      const repoName = CircleCICommon.getProject(pipeline.project_slug);
      res.push({
        model: 'cicd_Build',
        record: {
          ...buildKey,
          number: pipeline.number,
          name: `${CircleCICommon.getProject(pipeline.project_slug)}_${
            pipeline.number
          }_${workflow.name}`,
          createdAt: Utils.toDate(workflow.created_at),
          startedAt: Utils.toDate(workflow.created_at),
          endedAt: Utils.toDate(workflow.stopped_at),
          status: CircleCICommon.convertStatus(workflow.status),
        },
      });
      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: buildKey,
          commit: {
            sha: pipeline.vcs?.revision,
            uid: pipeline.vcs?.revision,
            repository: {
              name: repoName,
              uid: repoName,
              organization: {
                uid: CircleCICommon.getOrganization(pipeline.project_slug),
                source: pipeline.vcs?.provider_name,
              },
            },
          },
        },
      });
      for (const job of workflow.jobs) {
        res.push({
          model: 'cicd_BuildStep',
          record: {
            uid: toLower(job.id),
            name: job.name,
            startedAt: Utils.toDate(job.started_at),
            endedAt: Utils.toDate(job.stopped_at),
            status: CircleCICommon.convertStatus(job.status),
            type: CircleCICommon.convertJobType(job.type),
            build: buildKey,
          },
        });
      }
    }
    return res;
  }
}
