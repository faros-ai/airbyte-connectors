import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, parseObjectConfig, StreamContext} from '../converter';

export interface SheetsConfig {
  application_mapping?: ApplicationMapping;
}

type ApplicationMapping = Record<string, string>;

export abstract class SheetsConverter extends Converter {
  source = 'Sheets';
  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return (
      parseObjectConfig(
        this.config(ctx)?.application_mapping,
        'Application Mapping'
      ) ?? {}
    );
  }
  protected config(ctx: StreamContext): SheetsConfig {
    return ctx.config.source_specific_configs?.sheets ?? {};
  }

  id(record: AirbyteRecord): any {
    return record?.record?.data?.sheetName;
  }
}
