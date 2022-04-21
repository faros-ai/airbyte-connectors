import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureRepo, AzureRepoConfig} from '../azure-repo';
import {PullRequest} from '../models';

export class PullRequests extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureRepoConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pullrequests.json');
  }
  get primaryKey(): StreamKey {
    return 'pullRequestId';
  }
  get cursorField(): string | string[] {
    return 'creationDate';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<PullRequest> {
    const azureRepo = await AzureRepo.instance(this.config);
    yield* azureRepo.getPullRequests();
  }
}
