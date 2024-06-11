import {SyncMode} from 'faros-airbyte-cdk';
import {TestPlan} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {StreamSlice, XrayProjectStream} from './common';

export class TestPlans extends XrayProjectStream {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testPlans.json');
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<TestPlan> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    const project = streamSlice?.project;
    for (const plan of await xrayClient.getTestPlans(project)) {
      yield plan;
    }
  }
}
