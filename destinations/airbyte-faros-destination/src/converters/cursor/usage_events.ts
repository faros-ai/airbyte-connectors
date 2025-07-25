import {AirbyteRecord} from 'faros-airbyte-cdk';
import {UsageEventItem} from 'faros-airbyte-common/cursor';
import {Utils} from 'faros-js-client';

import {AssistantMetric, VCSToolCategory, VCSToolDetail} from '../common/vcs';
import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CursorConverter} from './common';

export class UsageEvents extends CursorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_AssistantMetric',
    'vcs_UserToolUsage',
  ];

  id(record: AirbyteRecord): string {
    const usageEventItem = record.record.data as UsageEventItem;
    return `${usageEventItem.timestamp}__${usageEventItem.userEmail}`;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const usageEventItem = record.record.data as UsageEventItem;

    if (!usageEventItem.userEmail) {
      return [];
    }

    const timestamp = Utils.toDate(Number(usageEventItem.timestamp));
    const res: DestinationRecord[] = [];
    res.push({
      model: 'vcs_UserToolUsage',
      record: {
        userTool: {
          user: {uid: usageEventItem.userEmail, source: this.streamName.source},
          organization: {
            uid: VCSToolDetail.Cursor,
            source: this.streamName.source,
          },
          tool: {
            category: VCSToolCategory.CodingAssistant,
            detail: VCSToolDetail.Cursor,
          },
        },
        usedAt: timestamp.toISOString(),
        recordedAt: timestamp.toISOString(),
      },
    });
    res.push(
      ...this.getAssistantMetric(
        timestamp,
        timestamp,
        AssistantMetric.Usages,
        1,
        VCSToolDetail.Cursor,
        usageEventItem.userEmail,
        undefined,
        usageEventItem.model
      )
    );
    return res;
  }
}
