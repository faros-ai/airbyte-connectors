import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamName} from '../converter';

export const TicketMetricsStream = new StreamName('zendesk', 'ticket_metrics');
export const TicketFieldsStream = new StreamName('zendesk', 'ticket_fields');

export abstract class ZendeskConverter extends Converter {
  source = 'Zendesk';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
