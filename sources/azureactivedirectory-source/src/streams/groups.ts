import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {
  AzureActiveDirectory,
  AzureActiveDirectoryConfig,
} from '../azureactivedirectory';
import {Group} from '../models';

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

  async *readRecords(): AsyncGenerator<Group> {
    const azureActiveDirectory = await AzureActiveDirectory.instance(
      this.config,
      this.logger
    );
    yield* azureActiveDirectory.getGroups();
  }
}
