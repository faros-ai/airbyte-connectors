import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {Users as OktaUsers} from '../okta/users';
import {OktaFarosConverter} from './common';

/**
 * This converter is identical to OktaUsers for Okta community source.
 * It is here to support the Okta source we developed at Faros.
 */
export class Users extends OktaFarosConverter {
  private alias = new OktaUsers();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  id(record: AirbyteRecord): any {
    return this.alias.id(record);
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record);
  }
}
