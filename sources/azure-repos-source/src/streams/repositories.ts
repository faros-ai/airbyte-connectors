import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {SyncMode} from 'faros-airbyte-cdk';
import {StreamWithProjectSlices} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {Repository} from '../models';

export class Repositories extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/repositories.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: TeamProject
  ): AsyncGenerator<Repository> {
    const azureRepos = await AzureRepos.instance<AzureRepos>(
      this.config,
      this.logger
    );
    yield* azureRepos.getRepositories(streamSlice);
  }
}
