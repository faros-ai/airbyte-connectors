import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GithubCommon, GithubConverter} from './common';

export class GithubIssueMilestones extends GithubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): ReadonlyArray<DestinationRecord> {
    const source = this.streamName.source;
    const milestone = record.record.data;

    const repository = GithubCommon.parseRepositoryKey(
      milestone.repository,
      source
    );
    if (!repository) return [];

    return [
      {
        model: 'tms_Epic',
        record: {
          uid: `${milestone.id}`,
          name: milestone.title,
          description: milestone.description?.substring(
            0,
            GithubCommon.MAX_DESCRIPTION_LENGTH
          ),
          project: {uid: repository.name, source},
          status: this.epicStatus(milestone.state),
          source,
        },
      },
    ];
  }

  private epicStatus(state: string): {category: string; detail: string} {
    switch (state) {
      case 'open':
        return {category: 'InProgress', detail: state};
      case 'closed':
        return {category: 'Done', detail: state};
      default:
        return {category: 'Custom', detail: state};
    }
  }
}
