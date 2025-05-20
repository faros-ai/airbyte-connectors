import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class FarosGroups extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'vcs_Organization',
    'tms_TaskBoard',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const group = record.record.data;
    const res: DestinationRecord[] = [];

    res.push({
      model: 'vcs_Organization',
      record: {
        uid: group.id,
        name: group.name,
        htmlUrl: group.web_url,
        type: {category: 'Group', detail: 'Group'},
        createdAt: Utils.toDate(group.created_at),
        source,
      },
    });

    res.push(
      GitlabCommon.tms_TaskBoard(
        {
          uid: group.id,
          source,
        },
        group.name
      )
    );

    return res;
  }
}
