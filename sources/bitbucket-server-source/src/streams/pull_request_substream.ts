import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {StreamBase} from './common';

export type StreamSlice = {
  project: string;
  repo: {slug: string; fullName: string};
};

export abstract class PullRequestSubStream extends StreamBase {
  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/pull_request_diffs.json');
  }

  get primaryKey(): StreamKey {
    return [
      ['computedProperties', 'pullRequest', 'repository', 'fullname'],
      ['computedProperties', 'pullRequest', 'id'],
    ];
  }

  get cursorField(): string | string[] {
    return ['computedProperties', 'pullRequest', 'updatedDate'];
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
}
