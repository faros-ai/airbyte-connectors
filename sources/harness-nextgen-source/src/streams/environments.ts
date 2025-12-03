import {SyncMode} from 'faros-airbyte-cdk';

import {Environment} from '../types';
import {ProjectSlice, StreamWithProjectSlices} from './common';

export class Environments extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/environments.json');
  }

  get primaryKey(): string[] {
    return ['orgIdentifier', 'projectIdentifier', 'identifier'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectSlice
  ): AsyncGenerator<Environment> {
    const harness = this.harness;
    yield* harness.getEnvironments(
      streamSlice.orgIdentifier,
      streamSlice.projectIdentifier
    );
  }
}
