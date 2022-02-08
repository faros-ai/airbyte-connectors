import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  AzureActiveDirectory,
  AzureActiveDirectoryConfig,
} from '../azure-active-directory';

export class Groups extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureActiveDirectoryConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/groups.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  get cursorField(): string | string[] {
    return 'createdDateTime';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any, string>, any, unknown> {
    const azureActiveDirectory =
      (await AzureActiveDirectory.instance()) ||
      (await AzureActiveDirectory.init(this.config));
    yield* azureActiveDirectory.getGroups();
  }
}
