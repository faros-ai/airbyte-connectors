import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Artifact} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosArtifacts extends StreamWithRepoSlices {
  get dependencies(): readonly string[] {
    return ['faros_workflow_runs'];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosArtifacts.json');
  }

  get primaryKey(): StreamKey {
    return [['org'], ['repo'], ['id']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Artifact> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    for (const workflowRun of await github.getWorkflowRuns(org, repo)) {
      yield* github.getWorkflowRunArtifacts(org, repo, workflowRun);
    }
  }
}
