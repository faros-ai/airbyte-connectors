import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Label} from 'faros-airbyte-common/github';
import {Dictionary} from 'ts-essentials';

import {GitHub} from '../github';
import {RepoStreamSlice, StreamWithRepoSlices} from './common';

export class FarosLabels extends StreamWithRepoSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosLabels.json');
  }

  get primaryKey(): StreamKey {
    return ['org', 'repo', 'name'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: RepoStreamSlice
  ): AsyncGenerator<Label> {
    const org = streamSlice?.org;
    const repo = streamSlice?.repo;
    const github = await GitHub.instance(this.config, this.logger);
    for await (const label of github.getLabels(org, repo)) {
      yield {
        ...label,
        tmsEnabled: this.config.tmsEnabled,
      };
    }
  }
}
