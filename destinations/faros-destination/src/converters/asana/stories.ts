import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {AsanaCommon, AsanaConverter} from './common';

export class AsanaStories extends AsanaConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Task',
    'tms_User',
  ];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const story = record.record.data;

    const creator = AsanaCommon.tms_User(story.created_by, source);

    res.push({
      model: 'tms_Task',
      record: {
        uid: story.gid,
        name: story.source || undefined,
        description: story.text?.substring(
          0,
          AsanaCommon.MAX_DESCRIPTION_LENGTH
        ),
        type: AsanaCommon.toTmsTaskType(story.resource_type),
        createdAt: Utils.toDate(story.created_at),
        updatedAt: Utils.toDate(story.created_at),
        creator: {uid: creator.record.uid, source},
        source,
      },
    });
    res.push(creator);

    return res;
  }
}
