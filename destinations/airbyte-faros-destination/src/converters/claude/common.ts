import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class ClaudeConverter extends Converter {
  source = 'Claude';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
