import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** AzureActiveDirectory converter base */
export abstract class AzureactivedirectoryConverter extends Converter {
  /** Almost every Azure Active Directory record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
