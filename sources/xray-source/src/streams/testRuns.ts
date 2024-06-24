import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {TestRun} from 'faros-airbyte-common/xray';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {XrayStreamBase} from './common';

const stateKey = 'lastModified';
type TestRunState = Dictionary<string>;

export class TestRuns extends XrayStreamBase {
  private latestModified: DateTime;

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
    for await (const run of xrayClient.getTestRuns(modifiedSince)) {
      const runModifiedDate = DateTime.fromISO(run.lastModified);
      if (!this.latestModified) {
        this.latestModified = runModifiedDate;
      } else if (runModifiedDate > this.latestModified) {
        this.latestModified = runModifiedDate;
      }
      yield run;
    }
  }

  getUpdatedState(
    currentStreamState: TestRunState,
    latestRecord: TestRun
  ): TestRunState {
    if (this.latestModified < DateTime.fromISO(currentStreamState[stateKey])) {
      return currentStreamState;
    }
    return {
      [stateKey]: TestRuns.formatModifiedSince(this.latestModified),
    };
  }
}
