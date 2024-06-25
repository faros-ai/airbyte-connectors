import {SyncMode} from 'faros-airbyte-cdk';
import {TestExecution} from 'faros-airbyte-common/xray';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {ProjectState, StreamSlice, XrayProjectStream} from './common';

export class TestExecutions extends XrayProjectStream {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/testExecutions.json');
  }

  get cursorField(): string {
    return 'lastModified';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: ProjectState
  ): AsyncGenerator<TestExecution> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    const project = streamSlice?.project;

    const modifiedSince = this.getModifiedSince(
      syncMode,
      streamState?.[project]
    );
    for await (const testExecution of xrayClient.getTestExecutions(
      project,
      modifiedSince
    )) {
      // Test executions are not sorted by lastModified, so we need to track the latest
      this.updateLatestModified(project, testExecution.lastModified);
      yield testExecution;
    }
  }

  getUpdatedState(
    currentStreamState: ProjectState,
    latestRecord: TestExecution
  ): ProjectState {
    const currentState = currentStreamState?.[latestRecord.project];
    const recordDate = this.lastModifiedByProject.get(latestRecord.project);
    if (currentState && DateTime.fromISO(currentState) > recordDate) {
      return currentStreamState;
    }
    return {
      ...currentStreamState,
      [latestRecord.project]: TestExecutions.formatModifiedSince(recordDate),
    };
  }
}
