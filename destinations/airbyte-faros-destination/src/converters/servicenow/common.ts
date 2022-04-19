import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';

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

interface ServiceNowConfig {
  default_severity?: IncidentSeverityCategory;
  default_priority?: IncidentPriorityCategory;
}

/** ServiceNow converter base */
export abstract class ServiceNowConverter extends Converter {
  source = 'ServiceNow';

  /** Almost every ServiceNow record has an id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.sys_id?.value;
  }

  protected config(ctx: StreamContext): ServiceNowConfig {
    return ctx.config.source_specific_configs?.servicenow ?? {};
  }
}
