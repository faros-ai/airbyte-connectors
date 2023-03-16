import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {Commit, Tag} from 'faros-airbyte-common/bitbucket-server';
import {Dictionary} from 'ts-essentials';

import {BitbucketServerConfig} from '../bitbucket-server';
import {StreamBase} from './common';

type StreamSlice = {project: string; repo: {slug: string; fullName: string}};

export class Tags extends StreamBase {
  constructor(
    readonly config: BitbucketServerConfig,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/tags.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    for (const project of this.config.projects) {
      for (const repo of await this.server.repositories(
        project,
        this.config.repositories
      )) {
        yield {
          project,
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
    const {project, repo} = streamSlice;
    yield* this.server.tags(project, repo.slug);
  }
}
