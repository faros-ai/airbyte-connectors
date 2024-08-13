import {AirbyteRecord} from 'faros-airbyte-cdk';
import {SamlSsoUser} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter, PartialUser} from './common';

export class FarosSamlSsoUsers extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const samlSsoUser = record.record.data as SamlSsoUser;
    const user: PartialUser = {
      org: samlSsoUser.org,
      ...samlSsoUser.user,
      email: samlSsoUser.samlIdentity?.nameId,
    };
    this.collectUser(user);
    return [];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertUsers();
  }
}
