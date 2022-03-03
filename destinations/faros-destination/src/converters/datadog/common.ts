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

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

interface DatadogConfig {
  application_mapping?: ApplicationMapping;
  default_severity?: IncidentSeverityCategory;
}

/** Datadog converter base */
export abstract class DatadogConverter extends Converter {
  /** Almost every Datadog record has an id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected config(ctx: StreamContext): DatadogConfig {
    return ctx.config.source_specific_configs?.datadog ?? {};
  }
}
