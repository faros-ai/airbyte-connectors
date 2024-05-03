import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';

import {DestinationModel, DestinationRecord} from '../converter';
import {GitHubCommon, GitHubConverter} from './common';

export class WorkflowRuns extends GitHubConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'cicd_Build',
    'cicd_BuildCommitAssociation',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const run = record.record.data;
    const res: DestinationRecord[] = [];

    const repositoryKey = GitHubCommon.parseRepositoryKey(
      run.repository.full_name,
      source
    );

    const pipeline = {
      uid: run.workflow_id.toString(),
      organization: repositoryKey.organization,
    };

    const build = {
      uid: run.id.toString(),
      name: run.name,
      runAttempt: run.run_attempt,
      number: run.run_number,
      createdAt: Utils.toDate(run.created_at),
      startedAt: Utils.toDate(run.run_started_at),
      endedAt: run.conclusion ? Utils.toDate(run.updated_at) : null,
      status: GitHubCommon.cicd_BuildStatus(run.status, run.conclusion),
      url: run.url,
      pipeline,
    };

    res.push({
      model: 'cicd_Build',
      record: build,
    });

    if (run.head_commit) {
      const commit = {
        sha: run.head_commit.id,
        uid: run.head_commit.id,
        repository: repositoryKey,
      };

      res.push({
        model: 'cicd_BuildCommitAssociation',
        record: {
          build: {uid: build.uid, pipeline},
          commit,
        },
      });
    }

    return res;
  }
}
