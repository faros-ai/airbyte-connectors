import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter} from './common';

export class AsanaProjects extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Project'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const project = record.record.data;

    const tmsProject: DestinationRecord = {
      model: 'tms_Project',
      record: {
        uid: project.gid,
        name: project.name,
        description: project.notes?.substring(
          0,
          AsanaCommon.MAX_DESCRIPTION_LENGTH
        ),
        createdAt: Utils.toDate(project.created_at),
        updatedAt: Utils.toDate(project.modified_at),
        source,
      },
    };

    return [tmsProject];
  }
}
