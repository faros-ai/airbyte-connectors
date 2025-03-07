import {StreamKey} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/jira';
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

  async *readRecords(): AsyncGenerator<Project> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKeys = this.config.projects?.length
      ? new Set(this.config.projects.map((key) => toUpper(key)))
      : undefined;
    for (const project of await jira.getProjects(projectKeys)) {
      const {included, issueSync} =
        await this.projectBoardFilter.getProjectInclusion(project.key);
      if (included) {
        yield {
          ...project,
          issueSync,
        };
      }
    }
  }
}
