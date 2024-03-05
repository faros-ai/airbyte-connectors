import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {JiraConverter} from './common';
import {AirbyteRecord} from "faros-airbyte-cdk";
import {toLower} from "lodash";

// Required as dependency by Issues converter
export class PullRequests extends JiraConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'tms_TaskPullRequestAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const pullRequest = record.record.data;
    const source = this.streamName.source;
    return [
      {
        model: 'tms_TaskPullRequestAssociation',
        record: {
          task: {uid: pullRequest.issueKey, source},
          pullRequest: {
            repository: {
              organization: {
                source: pullRequest.repo.source,
                uid: toLower(pullRequest.repo.org),
              },
              name: toLower(pullRequest.repo.name),
            },
            number: pullRequest.number,
          },
        },
      }
    ]
  }
}
