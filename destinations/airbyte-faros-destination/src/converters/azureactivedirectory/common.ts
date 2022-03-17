import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** AzureActiveDirectory converter base */
export abstract class AzureActiveDirectoryConverter extends Converter {
  source = 'AzureActiveDirectory';
  /** Almost every Azure Active Directory record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
