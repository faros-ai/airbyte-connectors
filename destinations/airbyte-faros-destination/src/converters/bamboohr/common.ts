import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** BambooHR converter base */
export abstract class BambooHRConverter extends Converter {
  source = 'BambooHR';
  /** Almost every Azure Active Directory record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
