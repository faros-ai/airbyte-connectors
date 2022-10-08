import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Project} from '../gitlab';
import {Groups} from './groups';

export class Projects extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
    readonly gitlab: Gitlab,
    readonly groups: Groups,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<Project> {
    const groups = this.groups.readRecords();
    const mainGroupResult = await groups.next();
    const groupPath = mainGroupResult.value.fullPath;

    yield* this.gitlab.getProjects(groupPath, this.config.projects);
  }
}
