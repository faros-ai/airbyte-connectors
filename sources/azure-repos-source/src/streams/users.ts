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
    return 'id';
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

  async *readRecords(): AsyncGenerator<User & {id: string}> {
    const azureRepos = await AzureRepos.instance(
      this.config,
      this.logger,
      this.config.branch_pattern,
      this.config.repositories,
      this.config.fetch_tags,
      this.config.fetch_branch_commits,
      this.config.fetch_pull_request_work_items
    );
    for await (const user of azureRepos.getUsers()) {
      const id = this.getUserId(user);
      if (!id) {
        this.logger.warn(`Could not determine a unique ID for user object. Skipping.`);
        continue;
      }
      yield {
        ...user,
        id,
      };
    }
  }

  private getUserId(user: User): string | undefined {
    if ('principalName' in user && user.principalName) {
      return user.principalName;
    }
    if ('uniqueName' in user && user.uniqueName) {
      return user.uniqueName;
    }
    return undefined;
  }
}
