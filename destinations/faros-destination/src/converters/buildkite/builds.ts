import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {Build, BuildkiteConverter} from './common';

export class BuildkiteBuilds extends BuildkiteConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const build = record.record.data as Build;

    const pipeline = {
      uid: build.pipeline?.slug,
      organization: {uid: build.pipeline?.organization?.slug, source},
    };
    const createdAt = Utils.toDate(build.createdAt);
    const startedAt = Utils.toDate(build.startedAt);
    const endedAt = Utils.toDate(build.finishedAt);
    const status = this.convertBuildState(build.state);
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Build',
      record: {
        uid: build.uuid,
        name: '',
        number: build.number,
        createdAt,
        startedAt,
        endedAt,
        status,
        url: build.url,
        pipeline,
      },
    });
    const repo = build.pipeline.repository;
    if (repo) {
      const repoKey = {
        organization: {uid: toLower(repo.url), source: repo.provider.name},
        name: toLower(repo.provider.name),
      };

      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: {uid: build.uuid, pipeline},
          commit: {repository: repoKey, sha: build.commit},
        },
      });
    }
    return res;
  }

  convertBuildState(state: string | undefined): {
    category: string;
    detail: string;
  } {
    if (!state) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = state.toLowerCase();

    // Read more on Buildkite build states:
    // https://buildkite.com/user/graphql/documentation/type/BuildStates
    switch (detail) {
      case 'canceling':
      case 'canceled':
        return {category: 'Canceled', detail};
      case 'failed':
        return {category: 'Failed', detail};
      case 'passed':
        return {category: 'Success', detail};
      case 'running':
        return {category: 'Running', detail};
      case 'scheduled':
      case 'blocked':
        return {category: 'Queued', detail};
      case 'skipped':
      case 'not_run':
      default:
        return {category: 'Custom', detail};
    }
  }
}
