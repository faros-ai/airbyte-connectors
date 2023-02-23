import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Pipeline} from '../circleci/typings';
import {CircleCIStreamBase} from './common';

type StreamSlice = {
  projectName: string;
};

export class Pipelines extends CircleCIStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const projectName of this.cfg.project_names) {
      yield {projectName};
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Pipeline, any, unknown> {
    for (const pipeline of await this.circleCI.fetchPipelines(
      streamSlice.projectName
    )) {
      yield pipeline;
    }
  }
}
