import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export abstract class ZephyrConverter extends Converter {
  source = 'Zephyr';
  taskSource = 'Jira';

  // Most Zephyr records have an id field that can be used as the record ID.
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected labelToTag(label?: string): ReadonlyArray<string> | null {
    return label ? [label] : null;
  }
}
