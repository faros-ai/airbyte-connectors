import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Card} from '../models';
import {MIN_DATE, Trello, TrelloConfig} from '../trello';
import {StreamSlice} from './common';

type StreamState = {[board: string]: {dateLastActivity: string}};

export class Cards extends AirbyteStreamBase {
  constructor(
    private readonly config: TrelloConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/cards.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'dateLastActivity';
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
    streamSlice?: StreamSlice,
    streamState?: StreamState
  ): AsyncGenerator<Card> {
    const dateLastActivity =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.board]?.dateLastActivity
        : undefined;

    const trello = Trello.instance(this.config, this.logger);

    yield* trello.getCards(streamSlice.board, dateLastActivity, this.logger);
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Card
  ): StreamState {
    const board = latestRecord.idBoard;
    const dateLastActivity =
      currentStreamState[board]?.dateLastActivity ?? MIN_DATE;
    const latestRecordDateLastActivity =
      latestRecord?.dateLastActivity ?? MIN_DATE;

    if (new Date(latestRecordDateLastActivity) > new Date(dateLastActivity)) {
      return {
        ...currentStreamState,
        [board]: {dateLastActivity: latestRecordDateLastActivity},
      };
    }
    return currentStreamState;
  }
}
