import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  CopilotSeatsStreamRecord,
  EnterpriseCopilotSeat,
  EnterpriseCopilotSeatsStreamRecord,
} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';
import {FarosCopilotSeats} from './faros_copilot_seats';

export class FarosEnterpriseCopilotSeats extends GitHubConverter {
  private readonly alias = new FarosCopilotSeats();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const enterpriseCopilotSeat = record.record
      .data as EnterpriseCopilotSeatsStreamRecord;
    record.record.data = {
      ...enterpriseCopilotSeat,
      startedAt: (enterpriseCopilotSeat as EnterpriseCopilotSeat).created_at,
      org: GitHubCommon.enterpriseUid(enterpriseCopilotSeat.enterprise),
    } as CopilotSeatsStreamRecord;
    return this.alias.convert(record, ctx);
  }
}
