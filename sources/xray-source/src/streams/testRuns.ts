import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {TestRun} from 'faros-airbyte-common/xray';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {XrayStreamBase} from './common';

const stateKey = 'lastModified';
type TestRunState = Dictionary<string>;
export class TestRuns extends XrayStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testRuns.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  get cursorField(): string {
    return 'lastModified';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: TestRunState
  ): AsyncGenerator<TestRun> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    const modifiedSince = this.getModifiedSince(
      syncMode,
      streamState?.[stateKey]
    );
    yield* xrayClient.getTestRuns(modifiedSince);
  }

  getUpdatedState(
    currentStreamState: TestRunState,
    latestRecord: TestRun
  ): TestRunState {
    return {
      [stateKey]: TestRuns.formatModifiedSince(latestRecord.lastModified),
    };
  }
}
