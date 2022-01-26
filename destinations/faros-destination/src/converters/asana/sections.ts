import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter, AsanaSection} from './common';

export class AsanaSections extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const section = record.record.data as AsanaSection;

    res.push(AsanaCommon.tms_TaskBoard(section, source));
    res.push({
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: {uid: section.gid, source},
        project: section.project ? {uid: section.project.gid, source} : null,
      },
    });

    return res;
  }
}
