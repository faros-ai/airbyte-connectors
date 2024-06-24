import {StreamKey} from 'faros-airbyte-cdk';
import {Version2Models} from 'jira.js';
import {toUpper} from 'lodash';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamBase} from './common';

export class FarosProjects extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosProjects.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'key';
  }

  async *readRecords(): AsyncGenerator<Version2Models.Project> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKeys = this.config.projects_included?.length
      ? new Set(this.config.projects_included.map((key) => toUpper(key)))
      : undefined;
    for (const project of await jira.getProjects(projectKeys)) {
      // Include queried project if projectKeys are specified or
      // if either there is no exclusion list or the project is not in the exclusion list
      if (
        projectKeys ||
        !this.config.projects_excluded?.includes(project.key)
      ) {
        yield project;
      }
    }
  }
}
