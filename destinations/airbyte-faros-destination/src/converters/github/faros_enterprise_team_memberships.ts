import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubConverter} from './common';
import {FarosTeamMemberships} from './faros_team_memberships';

export class FarosEnterpriseTeamMemberships extends GitHubConverter {
  private readonly alias = new FarosTeamMemberships();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return this.alias.convert(record, ctx);
  }
}
