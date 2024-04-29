import {StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Version2Models} from 'jira.js';
import {Dictionary} from 'ts-essentials';

import {Jira} from '../jira';
import {StreamBase} from './common';

export class FarosProjects extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosSprints.json');
  }

  get primaryKey(): StreamKey | undefined {
    return 'key';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Version2Models.Project> {
    const jira = await Jira.instance(this.config, this.logger);
    const projectKeys = this.config.project_keys;
    for await (const project of jira.getProjects()) {
      // Skip projects that are not in the project_keys list
      if (projectKeys && !projectKeys.includes(project.key)) {
        continue;
      }
      yield project;
    }
  }
}
