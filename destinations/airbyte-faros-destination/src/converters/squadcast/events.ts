import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {Event, IncidentEventTypeCategory, SquadcastConverter} from './common';

export class Events extends SquadcastConverter {
  id(record: AirbyteRecord): string {
    return record?.record?.data?.alert_source_id;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_IncidentEvent',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const event = record.record.data as Event;
    const status = event?.payload?.status;
    // Event ID can be undefined. It maybe because incident has one event
    const DEFAULT_EVENT_ID = 1;

    return [
      {
        model: 'ims_IncidentEvent',
        record: {
          uid: event?.payload?.event_id ?? String(DEFAULT_EVENT_ID),
          type: status && this.toEventType(status),
          createdAt: Utils.toDate(event.time_of_creation),
          detail: event.message,
          incident: {uid: event.incident_id, source},
        },
      },
    ];
  }

  private toEventType(status: string): {
    category: string;
    detail: string;
  } {
    const detail = status.toLowerCase();
    switch (detail) {
      case 'investigating':
      case 'triggered':
        return {category: IncidentEventTypeCategory.Created, detail};
      case 'identified':
      case 'acknowledged':
        return {category: IncidentEventTypeCategory.Acknowledged, detail};
      case 'resolved':
        return {category: IncidentEventTypeCategory.Resolved, detail};
      default:
        return {category: IncidentEventTypeCategory.Custom, detail};
    }
  }
}
