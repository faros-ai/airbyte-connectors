import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI} from '../circleci/circleci';
import {Project} from '../circleci/typings';
import {CircleCIStreamBase, StreamSlice} from './common';

export class Projects extends CircleCIStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
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
  ): AsyncGenerator<Project, any, unknown> {
    const circleCI = await CircleCI.instance(this.cfg, this.logger);
    yield await circleCI.fetchProject(streamSlice.projectName);
  }
}
