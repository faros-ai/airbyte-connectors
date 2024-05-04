import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Tag} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {projectKey: string; repo: {slug: string; fullName: string}};

export class Tags extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/tags.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for await (const project of this.projects()) {
      const projectKey = await this.fetchProjectKey(project.key);
      for (const repo of await this.server.repositories(
        projectKey,
        this.projectRepoFilter
      )) {
        yield {
          projectKey,
          repo: {slug: repo.slug, fullName: repo.computedProperties.fullName},
        };
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField: string[],
    streamSlice: StreamSlice
  ): AsyncGenerator<Tag> {
    const {projectKey, repo} = streamSlice;
    yield* this.server.tags(projectKey, repo.slug);
  }
}
