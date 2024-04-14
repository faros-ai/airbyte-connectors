import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, parseObjectConfig, StreamContext} from '../converter';

const DEFAULT_APPLICATION_FIELD = 'business_service';

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

export enum IncidentPriorityCategory {
  P1 = 'Critical',
  P2 = 'High',
  P3 = 'Medium',
  P4 = 'Low',
  Custom = 'Custom',
}

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface ServiceNowConfig {
  application_mapping?: ApplicationMapping;
  application_field?: string;
  default_severity?: IncidentSeverityCategory;
  default_priority?: IncidentPriorityCategory;
  store_current_incidents_associations?: boolean;
}

/** ServiceNow converter base */
export abstract class ServiceNowConverter extends Converter {
  source = 'ServiceNow';

  /** Almost every ServiceNow record has an id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.sys_id;
  }

  protected config(ctx: StreamContext): ServiceNowConfig {
    return ctx.config.source_specific_configs?.servicenow ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }
  protected applicationField(ctx: StreamContext): string {
    return this.config(ctx).application_field ?? DEFAULT_APPLICATION_FIELD;
  }

  protected onlyStoreCurrentIncidentsAssociations(ctx: StreamContext): boolean {
    return this.config(ctx).store_current_incidents_associations ?? false;
  }
}
