import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** AzureWorkitems converter base */
export abstract class AzureWorkitemsConverter extends Converter {
  source = 'AzureWorkitems';
  /** Almost every AzureWorkitems record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
