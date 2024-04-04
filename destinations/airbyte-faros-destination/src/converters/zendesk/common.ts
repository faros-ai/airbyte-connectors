import {AirbyteRecord} from 'faros-airbyte-cdk';
import {trim} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {
  Converter,
  parseObjectConfig,
  StreamContext,
  StreamName,
} from '../converter';

type TeamMapping = Dictionary<string>;

export interface ZendeskConfig {
  additional_fields_array_limit: number;
  customStatuses: any;
  fieldIdsByName: Map<string, Set<number>>;
  sync_groups?: boolean;
  team_mapping?: TeamMapping;
  ticket_additional_fields?: ReadonlyArray<string>;
}

interface OrgTeam {
  uid: string;
  name?: string;
  description?: string;
}

export const TicketMetricsStream = new StreamName('zendesk', 'ticket_metrics');
export const TicketFieldsStream = new StreamName('zendesk', 'ticket_fields');
export const GroupsStream = new StreamName('zendesk', 'groups');

export abstract class ZendeskConverter extends Converter {
  readonly projectUid = 'zendesk_tickets';
  readonly projectName = 'Zendesk Tickets';
  source = 'Zendesk';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected zendeskConfig(ctx: StreamContext): ZendeskConfig {
    return ctx?.config?.source_specific_configs?.zendesk ?? {};
  }

  protected teamMapping(ctx: StreamContext): TeamMapping {
    return (
      parseObjectConfig(
        this.zendeskConfig(ctx)?.team_mapping,
        'Team Mapping'
      ) ?? {}
    );
  }

  protected orgTeam(ctx: StreamContext, group: Dictionary<any>): OrgTeam {
    const teamMapping = this.teamMapping(ctx);
    const mappedTeam = teamMapping[trim(group.name)] || teamMapping['*'];
    if (mappedTeam) {
      return {uid: mappedTeam};
    }
    return {
      uid: trim(group.name),
      name: group.name,
      description: group.description,
    };
  }
}
