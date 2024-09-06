import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class IssueMilestones extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const milestone = record.record.data;

    const repository = GitHubCommon.parseRepositoryKey(
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
          description: Utils.cleanAndTruncate(
            milestone.description,
            GitHubCommon.MAX_DESCRIPTION_LENGTH
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
