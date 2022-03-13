import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BambooCommon, BambooConverter} from './common';
import {Build, PipelineKey} from './models';

export class BambooBuilds extends BambooConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const build = record.record.data as Build;

    const source = this.streamName.source;
    const baseUrl = this.baseUrl(ctx);

    if (!baseUrl) {
      return [];
    }
    const orgId = new URL(baseUrl).hostname;

    if (!orgId) {
      return [];
    }

    const buildStartedTime = Utils.toDate(build.buildStartedTime);
    const buildStatus = BambooCommon.convertBuildStatus(build.state);
    const pipelineKey: PipelineKey = {
      uid: toLower(build.plan.key),
      organization: {uid: orgId, source},
    };
    return [
      {
        model: 'cicd_Build',
        record: {
          uid: String(build.id),
          name: build.buildResultKey,
          number: build.buildNumber,
          startedAt: buildStartedTime,
          endedAt: Utils.toDate(build.buildCompletedTime),
          status: buildStatus,
          url: build.link.href,
          pipeline: pipelineKey,
        },
      },
    ];
  }
}
