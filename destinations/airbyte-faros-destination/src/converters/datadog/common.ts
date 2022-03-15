import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, parseObjectConfig, StreamContext} from '../converter';

export enum IncidentSeverityCategory {
  Sev1 = 'Sev1',
  Sev2 = 'Sev2',
  Sev3 = 'Sev3',
  Sev4 = 'Sev4',
  Sev5 = 'Sev5',
  Custom = 'Custom',
}

interface DatadogConfig {
  application_mapping?: ApplicationMapping;
  default_severity?: IncidentSeverityCategory;
}

type ApplicationMapping = Record<string, {name: string; platform?: string}>;

/** Datadog converter base */
export abstract class DatadogConverter extends Converter {
  source = 'Datadog';

  /** Almost every Datadog record has an id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }

  protected config(ctx: StreamContext): DatadogConfig {
    return ctx.config.source_specific_configs?.datadog ?? {};
  }
}
