import {AirbyteRecord} from 'faros-airbyte-cdk/lib';

import {Converter} from '../converter';

export const SOURCE = 'Bitbucket-Server';

export abstract class BitbucketServerConverter extends Converter {
  source = SOURCE;

  /** Almost all Bitbucket records should have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }
}
