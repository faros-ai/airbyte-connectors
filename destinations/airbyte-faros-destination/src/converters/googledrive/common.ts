import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../converter';

/** GoogleDrive converter base */
export abstract class GoogleDriveConverter extends Converter {
  source = 'GoogleDrive';

  /** Every GoogleDrive record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
