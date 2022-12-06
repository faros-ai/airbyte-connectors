import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {PagerDutyConverter} from './common';

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

export class IncidentLogEntries extends PagerDutyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'ims_IncidentEvent',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
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
