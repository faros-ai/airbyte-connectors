import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UsageReportItem} from 'faros-airbyte-common/claude-code';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {ClaudeCodeConverter} from './common';

export class UsageReport extends ClaudeCodeConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
  ];

  id(record: AirbyteRecord): string {
    const usageItem = record.record.data as UsageReportItem;
    return `${usageItem.date}__${usageItem.organization_id}__${usageItem.actor?.email_address || 'unknown'}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usageItem = record.record.data as UsageReportItem;

    if (!usageItem.actor?.email_address) {
      return [];
    }

    const day = Utils.toDate(usageItem.date);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);

    const organization = {
      uid: usageItem.organization_id.toLowerCase(),
      source: this.streamName.source,
    };

    const res: DestinationRecord[] = [];

    // TODO: Add specific Claude Code metric conversions here
    // This is just the boilerplate structure - no records emitted yet

    return res;
  }
}
