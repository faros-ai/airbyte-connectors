import {SyncMode} from 'faros-airbyte-cdk';
import {TestExecution} from 'faros-airbyte-common/xray';
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
    yield* xrayClient.getTestExecutions(project, modifiedSince);
  }

  getUpdatedState(
    currentStreamState: ProjectState,
    latestRecord: TestExecution
  ): ProjectState {
    return {
      ...currentStreamState,
      [latestRecord.project]: TestExecutions.formatModifiedSince(
        latestRecord.lastModified
      ),
    };
  }
}
