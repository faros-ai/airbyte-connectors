import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Action} from '../models';
import {MIN_DATE, Trello, TrelloConfig} from '../trello';
import {StreamSlice} from './common';

type StreamState = {[board: string]: {dateLastActivity: string}};

export class Actions extends AirbyteStreamBase {
  constructor(
    private readonly config: TrelloConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/actions.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get cursorField(): string | string[] {
    return 'date';
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
  ): AsyncGenerator<Action> {
    const dateLastActivity =
      syncMode === SyncMode.INCREMENTAL
        ? streamState?.[streamSlice.board]?.dateLastActivity
        : undefined;

    const trello = Trello.instance(this.config, this.logger);

    for (const action of await trello.getActions(
      streamSlice.board,
      dateLastActivity,
      this.logger
    )) {
      yield action;
    }
  }

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: Action
  ): StreamState {
    const board = latestRecord.data.board.id;
    const dateLastActivity =
      currentStreamState[board]?.dateLastActivity ?? MIN_DATE;
    const latestRecordDateLastActivity = latestRecord?.date ?? MIN_DATE;

    if (new Date(latestRecordDateLastActivity) > new Date(dateLastActivity)) {
      return {
        ...currentStreamState,
        [board]: {dateLastActivity: latestRecordDateLastActivity},
      };
    }
    return currentStreamState;
  }
}
