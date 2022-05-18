import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-feeds-sdk/lib';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class WorkflowRuns extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const run = record.record.data;

    const repositoryKey = GitHubCommon.parseRepositoryKey(
      run.repository.full_name,
      source
    );

    const build = {
      uid: run.id,
      name: run.name,
      number: run.run_number,
      createdAt: Utils.toDate(run.created_at),
      startedAt: Utils.toDate(run.started_at),
      endedAt: Utils.toDate(run.updated_at),
      status: this.cicd_BuildStatus(run.conclusion),
      url: run.url,
      pipeline: {
        uid: run.workflow_id,
        organization: repositoryKey.organization,
      },
    };

    const commit = {
      sha: run.head_commit.id,
      uid: run.head_commit.id,
      repository: repositoryKey,
    };

    return [
      {
        model: 'cicd_Build',
        record: build,
      },
      {
        model: 'cicd_BuildCommitAssociation',
        record: {
          build,
          commit,
        },
      },
    ];
  }

  private cicd_BuildStatus(conclusion: string): {
    category: string;
    detail: string;
  } {
    const conclusionLower = conclusion.toLowerCase();

    switch (conclusionLower) {
      case 'success':
        return {category: 'Success', detail: conclusionLower};
      case 'failure':
        return {category: 'Failed', detail: conclusionLower};
      case 'cancelled':
        return {category: 'Canceled', detail: conclusionLower};
      default:
        return {category: 'Custom', detail: conclusionLower};
    }
  }
}
