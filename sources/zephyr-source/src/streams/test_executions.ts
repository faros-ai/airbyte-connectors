import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Zephyr} from '../zephyr';
import {StreamSlice, ZephyrStreamBase} from './common';

export class TestExecutions extends ZephyrStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testExecutions.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<any> {
    const zephyrClient = await Zephyr.instance(this.config, this.logger);
    const project = streamSlice?.project;
    for (const testExecution of await zephyrClient.getTestExecutions(project)) {
      yield testExecution;
    }
  }
}
