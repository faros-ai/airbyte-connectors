import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** Okta converter base */
export abstract class OktaConverter extends Converter {
  source = 'Okta';

  /** Almost every Okta record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
