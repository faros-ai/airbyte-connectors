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

interface DataDogConfig {
  application_mapping?: ApplicationMapping;
  default_severity?: IncidentSeverityCategory;
}

/** DataDog converter base */
export abstract class DataDogConverter extends Converter {
  /** Almost every DataDog record has an id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected config(ctx: StreamContext): DataDogConfig {
    return ctx.config.source_specific_configs?.datadog ?? {};
  }
}
