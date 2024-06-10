import {SyncMode} from 'faros-airbyte-cdk';
import {Test} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {StreamSlice, XrayProjectStream} from './common';

export class Tests extends XrayProjectStream {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tests.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Test> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    const project = streamSlice?.project;
    yield* xrayClient.getTests(project);
  }
}
