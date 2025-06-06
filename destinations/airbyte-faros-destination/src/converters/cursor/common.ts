import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class CursorConverter extends Converter {
  source = 'Cursor';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
