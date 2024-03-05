import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Board} from '../models';
import {Trello, TrelloConfig} from '../trello';

export class Boards extends AirbyteStreamBase {
  constructor(
    private readonly config: TrelloConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/boards.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Board> {
    const trello = Trello.instance(this.config, this.logger);

    for (const board of await trello.getBoards()) {
      yield board;
    }
  }
}
