import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export interface WindsurfConfig {
  // Add any windsurf-specific configuration here in the future
}

export abstract class WindsurfConverter extends Converter {
  source = 'Windsurf';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.email;
  }
}
