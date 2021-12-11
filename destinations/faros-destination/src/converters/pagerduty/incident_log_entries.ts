import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PagerdutyConverter} from './common';

interface IncidentEventType {
  category: IncidentEventTypeCategory;
  detail: string;
}

enum IncidentEventTypeCategory {
  Created = 'Created',
  Acknowledged = 'Acknowledged',
  Resolved = 'Resolved',
  Custom = 'Custom',
}

export class PagerdutyIncidentLogEntries extends PagerdutyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_IncidentEvent'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const event = record.record.data;

    return [
      {
        model: 'ims_IncidentEvent',
        record: {
          uid: event.id,
          type: this.eventType(event.type),
          createdAt: Utils.toDate(event.created_at),
          detail: event.summary,
          incident: {uid: event.incident.id, source},
        },
      },
    ];
  }

  private eventType(logEntryType: string): IncidentEventType {
    const typeRef = logEntryType.split('_')[0]; // i.e. "resolve" of "resolve_log_entry"
    let eventTypeCategory;
    switch (typeRef.toLowerCase()) {
      case 'trigger':
        eventTypeCategory = IncidentEventTypeCategory.Created;
        break;
      case 'acknowledge':
        eventTypeCategory = IncidentEventTypeCategory.Acknowledged;
        break;
      case 'resolve':
        eventTypeCategory = IncidentEventTypeCategory.Resolved;
        break;
      default:
        eventTypeCategory = IncidentEventTypeCategory.Custom;
        break;
    }
    return {category: eventTypeCategory, detail: logEntryType};
  }
}
