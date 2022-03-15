import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {
  IncidentEventType,
  IncidentEventTypeCategory,
  StatusPageConverter,
  StatuspageIncidentStatus,
} from './common';

export class IncidentUpdates extends StatusPageConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_IncidentEvent',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const update = record.record.data;

    return [
      {
        model: 'ims_IncidentEvent',
        record: {
          uid: update.id,
          type: this.eventType(update.status),
          createdAt: Utils.toDate(update.created_at),
          detail: update.body,
          incident: {uid: update.incident_id, source},
        },
      },
    ];
  }

  private eventType(updateStatus: StatuspageIncidentStatus): IncidentEventType {
    const detail: string = updateStatus;
    switch (updateStatus) {
      case StatuspageIncidentStatus.Investigating:
        return {category: IncidentEventTypeCategory.Created, detail};
      case StatuspageIncidentStatus.Identified:
        return {category: IncidentEventTypeCategory.Acknowledged, detail};
      case StatuspageIncidentStatus.Resolved:
        return {category: IncidentEventTypeCategory.Resolved, detail};
      case StatuspageIncidentStatus.Monitoring:
      case StatuspageIncidentStatus.Postmortem:
      default:
        return {category: IncidentEventTypeCategory.Custom, detail};
    }
  }
}
