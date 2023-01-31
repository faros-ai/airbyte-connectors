import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class Groups extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Organization',
    'vcs_Organization',
    'tms_Project',
    'tms_TaskBoard',
    'tms_TaskBoardProjectRelationship',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const group = record.record.data;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'cicd_Organization',
      record: {
        uid: group.full_path,
        description: group.description?.substring(
          0,
          GitlabCommon.MAX_DESCRIPTION_LENGTH
        ),
        name: group.name,
        url: group.web_url,
        source,
      },
    });

    res.push({
      model: 'vcs_Organization',
      record: {
        uid: group.full_path,
        name: group.name,
        htmlUrl: group.web_url,
        type: {category: 'Group', detail: ''},
        createdAt: Utils.toDate(group.created_at),
        source,
      },
    });

    // GitLab can track tasks at a group level as well
    res.push(
      ...GitlabCommon.tms_ProjectBoard_with_TaskBoard(
        {uid: group.full_path, source},
        group.name,
        group.description,
        group.created_at,
        null
      )
    );

    return res;
  }
}
