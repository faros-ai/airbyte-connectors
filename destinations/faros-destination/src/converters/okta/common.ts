import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

export class OktaCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
}

/** Okta converter base */
export abstract class OktaConverter extends Converter {
  /** Almost every Okta record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
