import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class SheetsConverter extends Converter {
  source = 'Sheets';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}