import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {BambooCommon, BambooConverter} from './common';
import {Build} from './models';

export class BambooBuilds extends BambooConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['cicd_Build'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const build = record.record.data as Build;
    const buildStartedTime = Utils.toDate(build.buildStartedTime);
    const buildStatus = BambooCommon.convertBuildStatus(build.state);

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
          pipeline: build.plan.key,
        },
      },
    ];
  }
}
