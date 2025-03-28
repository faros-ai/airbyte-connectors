import {TeamProject} from 'azure-devops-node-api/interfaces/CoreInterfaces';
import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {AzureWorkitems} from '../azure-workitems';
import {StreamBase} from './common';

export class Projects extends StreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/project.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<TeamProject> {
    const azureWorkitem = await AzureWorkitems.instance(
      this.config,
      this.logger
    );
    yield* await azureWorkitem.getProjects(this.config.projects);
  }
}
