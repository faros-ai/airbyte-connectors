import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems, AzureWorkitemsConfig} from '../azure-workitems';
import {Project} from '../models';
import {StreamBase} from './common';

export class Projects extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/project.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Project> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    const projects = await azureWorkitem.getProjects(this.config.projects);
    for (const project of projects) {
      yield project;
    }
  }
}
