import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitlabCommon, GitlabConverter} from './common';

export class ProjectMilestones extends GitlabConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['tms_Epic'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const milestone = record.record.data;

    const repository = GitlabCommon.parseRepositoryKey(
      milestone.web_url,
      source
    );

    return [
      {
        model: 'tms_Epic',
        record: {
          uid: String(milestone.id),
          name: milestone.title,
          description: milestone.description?.substring(
            0,
            GitlabCommon.MAX_DESCRIPTION_LENGTH
          ),
          project: {uid: repository.uid, source},
          status: this.epicStatus(milestone.state),
          source,
        },
      },
    ];
  }

  private epicStatus(state?: string): {category: string; detail: string} {
    const detail = state?.toLowerCase();
    switch (detail) {
      case 'active':
        return {category: 'InProgress', detail};
      case 'closed':
        return {category: 'Done', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
