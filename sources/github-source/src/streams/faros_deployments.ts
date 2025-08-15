import {StreamKey} from 'faros-airbyte-cdk';
import {Deployment} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosDeployments extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosDeployments.json');
  }

  get primaryKey(): StreamKey {
    return 'databaseId';
  }

  get cursorField(): string | string[] {
    return 'createdAt';
  }

  async *readRecords(
    _syncMode: unknown,
    _cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Deployment> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const [startDate, endDate] = this.getUpdateRange();
    const github = await GitHub.instance(this.config, this.logger);
    yield* github.getDeployments(org, repo, startDate, endDate);
  }
}
