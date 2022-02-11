import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {OktaUsers} from '../okta/users';

/**
 * This converter is identical to OktaUsers for Okta community source.
 * It is here to support the Okta source we developed at Faros.
 */
export class OktaFarosUsers extends Converter {
  private alias = new OktaUsers();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  id(record: AirbyteRecord): any {
    return this.alias.id(record);
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record, ctx);
  }
}
