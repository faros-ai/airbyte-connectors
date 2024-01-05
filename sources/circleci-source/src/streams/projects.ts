import {Dictionary} from 'ts-essentials';

import {Project} from '../circleci/types';
import {CircleCIStreamBase} from './common';

export class Projects extends CircleCIStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Project, any, unknown> {
    for await (const project of this.cfg.project_slugs) {
      yield await this.circleCI.fetchProject(project);
    }
  }
}
