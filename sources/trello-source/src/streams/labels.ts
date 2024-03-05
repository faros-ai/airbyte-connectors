import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Label} from '../models';
import {Trello, TrelloConfig} from '../trello';
import {StreamSlice} from './common';

export class Labels extends AirbyteStreamBase {
  constructor(
    private readonly config: TrelloConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/labels.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const trello = Trello.instance(this.config);

    for (const board of await trello.getBoards()) {
      yield {board: board.id};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Label> {
    const trello = Trello.instance(this.config);
    yield* trello.getLabels(streamSlice.board);
  }
}
