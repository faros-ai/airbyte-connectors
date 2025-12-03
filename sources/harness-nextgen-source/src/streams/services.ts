import {SyncMode} from 'faros-airbyte-cdk';

import {Service} from '../types';
import {ProjectSlice, StreamWithProjectSlices} from './common';

export class Services extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/services.json');
  }

  get primaryKey(): string[] {
    return ['orgIdentifier', 'projectIdentifier', 'identifier'];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectSlice
  ): AsyncGenerator<Service> {
    const harness = this.harness;
    yield* harness.getServices(
      streamSlice.orgIdentifier,
      streamSlice.projectIdentifier
    );
  }
}
