import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export const MAX_DESCRIPTION_LENGTH = 1000;

/** Azure TFVC converter base */
export abstract class AzureTfvcConverter extends Converter {
  source = 'Azure-TFVC';

  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
