import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems, AzureWorkitemsConfig} from '../azure-workitems';
import {Board} from '../models';

export class Boards extends AirbyteStreamBase {
  constructor(
    private readonly config: AzureWorkitemsConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/board.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Board> {
    const azureWorkitems = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    yield* azureWorkitems.getBoards();
  }
}
