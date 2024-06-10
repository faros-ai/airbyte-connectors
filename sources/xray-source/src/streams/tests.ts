import {SyncMode} from 'faros-airbyte-cdk';
import {Test} from 'faros-airbyte-common/xray';
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
    yield* xrayClient.getTests(project, modifiedSince);
  }

  getUpdatedState(
    currentStreamState: ProjectState,
    latestRecord: Test
  ): ProjectState {
    return {
      ...currentStreamState,
      [latestRecord.project]: Tests.formatModifiedSince(
        latestRecord.lastModified
      ),
    };
  }
}
