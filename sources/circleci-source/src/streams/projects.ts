import {AxiosInstance} from 'axios';
import {AirbyteLogger, AirbyteStreamBase, SyncMode} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, CircleCIConfig} from '../circleci/circleci';
import {Project} from '../circleci/typings';
type StreamSlice = {
  orgSlug: string;
  repoName: string;
};

export class Projects extends AirbyteStreamBase {
  constructor(
    logger: AirbyteLogger,
    private readonly config: CircleCIConfig,
    private readonly axios?: AxiosInstance
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/projects.json');
  }

  get primaryKey(): string {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const orgSlug of this.config.org_slugs) {
      for (const repoName of this.config.repo_names) {
        yield {
          orgSlug,
          repoName,
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any, string>
  ): AsyncGenerator<Project, any, unknown> {
    const circleCI = CircleCI.instance(this.config, this.axios);
    yield* circleCI.fetchProject(streamSlice.orgSlug, streamSlice.repoName);
  }
}
