import {StreamKey} from 'faros-airbyte-cdk';
import {User} from 'faros-airbyte-common/azure-devops';
import {Dictionary} from 'ts-essentials';

import {AzureRepos} from '../azure-repos';
import {AzureReposStreamBase} from './common';

export class Users extends AzureReposStreamBase {
  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return 'principalName';
  }

  // Although not actually an incremental stream, we run it in incremental mode
  // to avoid deleting the users that are written by the incremental
  // pull_requests stream.
  get supportsIncremental(): boolean {
    return true;
  }

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'url';
  }

  async *readRecords(): AsyncGenerator<User> {
    const azureRepos = await AzureRepos.instance<AzureRepos>(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits
    );
    yield* azureRepos.getUsers();
  }
}
