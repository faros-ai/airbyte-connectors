import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {AsanaCommon, AsanaConverter, AsanaSection} from './common';

export class Sections extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const section = record.record.data as AsanaSection;

    res.push(AsanaCommon.tms_TaskBoard(section, source));

    if (section.project) {
      res.push({
        model: 'tms_TaskBoardProjectRelationship',
        record: {
          board: {uid: section.gid, source},
          project: {uid: section.project.gid, source},
        },
      });
    }

    return res;
  }
}
