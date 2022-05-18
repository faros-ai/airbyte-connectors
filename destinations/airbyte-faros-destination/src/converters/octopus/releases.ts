import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {OctopusConverter} from './common';
import {Release} from './models';

export class Releases extends OctopusConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['org_Release'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const release = record.record.data as Release;
    const uid = release.Id;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'org_Release',
      record: {
        uid,
        spaceId: release.SpaceId,
        projectId: release.ProjectId,
        version: release.Version,
        channelId: release.ChannelId,
        releaseNotes: release.ReleaseNotes,
        projectDeploymentProcessSnapshotId:
          release.ProjectDeploymentProcessSnapshotId,
        ignoreChannelRules: release.IgnoreChannelRules,
        buildInformation: release.BuildInformation,
        assembled: release.Assembled,
        libraryVariableSetSnapshotIds: release.LibraryVariableSetSnapshotIds,
        selectedPackages: release.SelectedPackages,
        projectVariableSetSnapshotId: release.ProjectVariableSetSnapshotId,
        versionControlReference: release.VersionControlReference,
        source,
      },
    });
    return res;
  }
}
