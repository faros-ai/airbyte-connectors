import {SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI} from '../circleci/circleci';
import {Project} from 'faros-airbyte-common/circleci';
import {StreamSlice, StreamWithProjectSlices} from './common';

export class Projects extends StreamWithProjectSlices {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<Project, any, unknown> {
    const circleCI = CircleCI.instance(this.cfg, this.logger);
    yield await circleCI.fetchProject(streamSlice.projectSlug);
  }
}
