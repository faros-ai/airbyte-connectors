import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {Board} from '../models';
import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class Boards extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/board.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<Board> {
    const azureWorkitems = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const projectId = streamSlice?.id;
    yield* azureWorkitems.getBoards(projectId);
  }
}
