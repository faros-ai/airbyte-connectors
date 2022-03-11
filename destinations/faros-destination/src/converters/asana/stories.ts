import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter} from './common';

export class Stories extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Task'];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const story = record.record.data;

    res.push({
      model: 'tms_Task',
      record: {
        uid: story.gid,
        name: story.source || null,
        description: story.text?.substring(
          0,
          AsanaCommon.MAX_DESCRIPTION_LENGTH
        ),
        type: AsanaCommon.toTmsTaskType(story.resource_type),
        createdAt: Utils.toDate(story.created_at),
        updatedAt: Utils.toDate(story.created_at),
        creator: {uid: story.created_by.gid, source},
        source,
      },
    });

    return res;
  }
}
