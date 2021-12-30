import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export class AgileacceleratorCommon {
  // Max length for free-form description text fields such as works description
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
}

/** AgileAccelerator converter base */
export abstract class AgileacceleratorConverter extends Converter {
  /** Almost every AgileAccelerator record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.Id;
  }
}
