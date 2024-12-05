import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamName} from '../converter';

/** AzureWorkitems converter base */
export abstract class AzureWorkitemsConverter extends Converter {
  source = 'Azure-Workitems';
  /** Almost every AzureWorkitems record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}

export const IterationsStream = new StreamName('azure-workitems', 'iterations');
