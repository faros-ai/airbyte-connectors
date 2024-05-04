import {StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {StreamBase} from './common';

export type StreamSlice = {
  projectKey: string;
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
}
