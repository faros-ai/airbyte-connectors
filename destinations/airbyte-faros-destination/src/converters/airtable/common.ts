import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class AirtableConverter extends Converter {
  source = 'Airtable';
  id(record: AirbyteRecord): any {
    return record?.record?.data?._airtable_id;
  }
}
