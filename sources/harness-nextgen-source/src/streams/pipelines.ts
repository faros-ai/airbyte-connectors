import {SyncMode} from 'faros-airbyte-cdk';

import {Pipeline} from '../types';
import {ProjectSlice, StreamWithProjectSlices} from './common';

export class Pipelines extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): string[] {
    return ['orgIdentifier', 'projectIdentifier', 'identifier'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectSlice
  ): AsyncGenerator<Pipeline> {
    const harness = this.harness;
    yield* harness.getPipelines(
      streamSlice.orgIdentifier,
      streamSlice.projectIdentifier
    );
  }
}
