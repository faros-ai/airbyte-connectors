import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {User} from '../models';
import {Trello, TrelloConfig} from '../trello';
import {StreamSlice} from './common';

export class Users extends AirbyteStreamBase {
  constructor(
    private readonly config: TrelloConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const trello = Trello.instance(this.config, this.logger);

    for (const board of await trello.getBoards()) {
      yield {board: board.id};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<User> {
    const trello = Trello.instance(this.config, this.logger);
    yield* trello.getUsers(streamSlice.board);
  }
}
