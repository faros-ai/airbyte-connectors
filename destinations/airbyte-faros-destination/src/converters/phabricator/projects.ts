import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PhabricatorConverter} from './common';

export class Projects extends PhabricatorConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const project = record.record.data;
    const res: DestinationRecord[] = [];

    const maxDescriptionLength = this.maxDescriptionLength(ctx);

    res.push({
      model: 'tms_Project',
      record: {
        uid: project.phid,
        name: project.fields?.name,
        description: Utils.cleanAndTruncate(
          project.fields?.description,
          maxDescriptionLength
        ),
        createdAt: Utils.toDate(project.fields?.dateCreated * 1000),
        updatedAt: Utils.toDate(project.fields?.dateModified * 1000),
        source,
      },
    });
    res.push({
      model: 'tms_TaskBoard',
      record: {
        uid: project.phid,
        name: project.fields?.name,
        source,
      },
    });
    res.push({
      model: 'tms_TaskBoardProjectRelationship',
      record: {
        board: {uid: project.phid, source},
        project: {uid: project.phid, source},
      },
    });

    return res;
  }
}
