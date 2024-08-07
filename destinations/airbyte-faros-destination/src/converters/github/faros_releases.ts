import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Release} from 'faros-airbyte-common/github';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubConverter} from './common';
import {Releases as CommunityReleases} from './releases';

export class FarosReleases extends GitHubConverter {
  private alias = new CommunityReleases();

  readonly destinationModels: ReadonlyArray<DestinationModel> =
    this.alias.destinationModels;

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const release = record.record.data as Release;
    this.collectUser(release.author);
    return this.alias.convert(record);
  }

  async onProcessingComplete(): Promise<ReadonlyArray<DestinationRecord>> {
    return this.convertUsers();
  }
}
