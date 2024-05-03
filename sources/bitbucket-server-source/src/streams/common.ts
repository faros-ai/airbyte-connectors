import {AirbyteLogger, AirbyteStreamBase} from 'faros-airbyte-cdk';
import {Project} from 'faros-airbyte-common/bitbucket-server';

import {BitbucketServer, BitbucketServerConfig} from '../bitbucket-server';
import {ProjectRepoFilter} from '../bitbucket-server/project-repo-filter';

export abstract class StreamBase extends AirbyteStreamBase {
  readonly projectRepoFilter: ProjectRepoFilter;

  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
    this.projectRepoFilter = new ProjectRepoFilter(
      config.projects ?? [],
      config.repositories ?? []
    );
  }

  get server(): BitbucketServer {
    return BitbucketServer.instance(this.config, this.logger);
  }

  async *projects(): AsyncGenerator<Project> {
    for (const project of await this.server.projects(
      this.projectRepoFilter.getProjectKeys()
    )) {
      yield project;
    }
  }

  // Fetch the project key from the Bitbucket API in case it was renamed
  async fetchProjectKey(configProjectKey: string): Promise<string> {
    return (await this.server.project(configProjectKey)).key;
  }
}
