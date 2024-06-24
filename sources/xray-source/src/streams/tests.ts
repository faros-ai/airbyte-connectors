import {SyncMode} from 'faros-airbyte-cdk';
import {Test} from 'faros-airbyte-common/xray';
import {DateTime} from 'luxon';
import {Dictionary} from 'ts-essentials';

import {Xray} from '../xray';
import {ProjectState, StreamSlice, XrayProjectStream} from './common';

export class Tests extends XrayProjectStream {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/tests.json');
  }

  get cursorField(): string {
    return 'lastModified';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: ProjectState
  ): AsyncGenerator<Test> {
    const xrayClient = await Xray.instance(this.config, this.logger);
    const project = streamSlice?.project;
    const modifiedSince = this.getModifiedSince(
      syncMode,
      streamState?.[project]
    );
    for await (const test of xrayClient.getTests(project, modifiedSince)) {
      this.updateLatestModified(project, test.lastModified);
      yield test;
    }
  }

  getUpdatedState(
    currentStreamState: ProjectState,
    latestRecord: Test
  ): ProjectState {
    const currentState = currentStreamState?.[latestRecord.project];
    const recordDate = this.lastModifiedByProject.get(latestRecord.project);
    if (currentState && DateTime.fromISO(currentState) > recordDate) {
      return currentStreamState;
    }
    return {
      ...currentStreamState,
      [latestRecord.project]: Tests.formatModifiedSince(recordDate),
    };
  }
}
