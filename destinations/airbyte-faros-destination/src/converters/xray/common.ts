import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export interface ModelEnumType {
  category: string;
  detail: string;
}

export abstract class XrayConverter extends Converter {
  source = 'Xray';
  taskSource = 'Jira';

  // Most Xray records have a key field that can be used as the record ID.
  id(record: AirbyteRecord): any {
    return record?.record?.data?.key;
  }
}
