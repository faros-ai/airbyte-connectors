import {StreamKey, SyncMode} from 'faros-airbyte-cdk';

import {ProjectStreamSlice, StreamWithProjectSlices} from './common';

export class Projects extends StreamWithProjectSlices {
  getJsonSchema(): Record<string, any> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: ProjectStreamSlice
  ): AsyncGenerator<Record<string, any>> {
    yield {
      ...streamSlice.project,
      organization: streamSlice.organization,
    };
  }
}
