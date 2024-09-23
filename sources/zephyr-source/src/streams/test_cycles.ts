import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Zephyr} from '../zephyr';
import {StreamSlice, ZephyrStreamBase} from './common';

export class TestCycles extends ZephyrStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testCycles.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<any> {
    const zephyrClient = await Zephyr.instance(this.config, this.logger);
    const project = streamSlice?.project;
    for (const testCycle of await zephyrClient.getTestCycles(project)) {
      yield testCycle;
    }
  }
}
