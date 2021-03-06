import {AirbyteStreamBase, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {AirbyteLogger} from 'faros-airbyte-cdk/lib';
import {Dictionary} from 'ts-essentials';

import {Gitlab, GitlabConfig, Project} from '../gitlab';
import {Groups} from './groups';

export class Projects extends AirbyteStreamBase {
  constructor(
    readonly config: GitlabConfig,
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

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any, string>,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Project> {
    const gitlab = Gitlab.instance(this.config, this.logger);
    const groups = this.groups.readRecords(SyncMode.FULL_REFRESH);
    const mainGroupResult = await groups.next();
    const groupPath = mainGroupResult.value.fullPath;

    yield* gitlab.getProjects(groupPath, this.config.projects);
  }
}
