import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Pipeline, PipelineState} from 'faros-airbyte-common/bitbucket';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {BitbucketConverter, CategoryRef} from './common';

enum BuildStatusCategory {
  CANCELED = 'Canceled',
  FAILED = 'Failed',
  QUEUED = 'Queued',
  RUNNING = 'Running',
  SUCCESS = 'Success',
  UNKNOWN = 'Unknown',
  CUSTOM = 'Custom',
}

export class Pipelines extends BitbucketConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const pipeline = record.record.data as Pipeline;
    const res: DestinationRecord[] = [];

    const [workspace, repo] = (pipeline?.repository?.fullName || '').split('/');
    if (!workspace || !repo) return res;
    const status = this.convertBuildStatus(pipeline.state);
    const orgKey = {uid: workspace?.toLowerCase(), source};
    const pipelineKey = {organization: orgKey, uid: repo?.toLowerCase()};

    res.push({
      model: 'cicd_Build',
      record: {
        uid: pipeline.uuid,
        number: pipeline.buildNumber,
        pipeline: pipelineKey,
        status,
        url: pipeline.links?.htmlUrl,
        startedAt: Utils.toDate(pipeline.createdOn),
        endedAt: Utils.toDate(pipeline.completedOn),
      },
    });

    if (pipeline.target?.commit?.hash) {
      const projectKey = {
        name: repo.toLowerCase(),
        uid: repo.toLowerCase(),
        organization: {uid: orgKey.uid, source},
      };
      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: {uid: pipeline.uuid, pipeline: pipelineKey},
          commit: {
            repository: projectKey,
            sha: pipeline.target.commit.hash,
            uid: pipeline.target.commit.hash,
          },
        },
      });
    }

    return res;
  }

  private convertBuildStatus(state?: PipelineState): CategoryRef {
    if (!state) {
      return {category: 'Unknown', detail: 'undefined'};
    }

    // We're more interest in the "stage" than the "state" as this tells the true
    // state of a pipeline build. The switch statement however takes care of all
    // possible entries from both the "stage" and "state".
    const detail = (state.stage?.name || state.name)?.toLowerCase();
    switch (detail) {
      case 'error':
      case 'failed':
        return {category: BuildStatusCategory.FAILED, detail};
      case 'in_progress':
      case 'running':
        return {category: BuildStatusCategory.RUNNING, detail};
      case 'pending':
        return {category: BuildStatusCategory.QUEUED, detail};
      case 'stopped':
        return {category: BuildStatusCategory.CANCELED, detail};
      case 'completed':
      case 'successful':
        return {category: BuildStatusCategory.SUCCESS, detail};
      default:
        return {category: BuildStatusCategory.CUSTOM, detail};
    }
  }
}
