import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  CopilotUsageSummary,
  EnterpriseCopilotUsageSummary,
} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';
import {FarosCopilotUsage} from './faros_copilot_usage';

export class FarosEnterpriseCopilotUsage extends GitHubConverter {
  private readonly alias = new FarosCopilotUsage();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const enterpriseCopilotUsage = record.record
      .data as EnterpriseCopilotUsageSummary;
    record.record.data = {
      ...enterpriseCopilotUsage,
      org: GitHubCommon.enterpriseUid(enterpriseCopilotUsage.enterprise),
    } as CopilotUsageSummary;
    return this.alias.convert(record, ctx);
  }
}
