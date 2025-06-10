import {AirbyteRecord} from 'faros-airbyte-cdk';
import {toLower} from 'lodash';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabConverter} from './common';

export class FarosTags extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['vcs_Tag'];

  id(record: AirbyteRecord): any {
    const tag = record?.record?.data;
    return `${tag?.name}_${tag?.commit_id}`;
  }

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const tag = record.record.data;

    // Build repository key from group_id and project_path
    const repository = {
      name: toLower(tag.project_path),
      uid: toLower(tag.project_path),
      organization: {
        uid: toLower(tag.group_id),
        source,
      },
    };

    return [
      {
        model: 'vcs_Tag',
        record: {
          name: tag.name,
          message: tag.title,
          commit: {sha: tag.commit_id, uid: tag.commit_id, repository},
          repository,
        },
      },
    ];
  }
}

