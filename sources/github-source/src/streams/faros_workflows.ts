import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Workflow} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosWorkflows extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosWorkflows.json');
  }

  get primaryKey(): StreamKey {
    return [['org'], ['repo'], ['id']];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Workflow> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getWorkflows(org, repo);
  }
}
