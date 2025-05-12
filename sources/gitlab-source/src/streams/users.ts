import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GitLabConfig} from '../types';
import {StreamBase} from './common';

export class Users extends StreamBase {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/users.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get name(): string {
    return 'gitlab_users';
  }

  get supportsIncremental(): boolean {
    return false;
  }

  get dependencies(): ReadonlyArray<string> {
    return ['gitlab_groups'];
  }

  get cursorField(): string[] {
    return [];
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any>> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    const filter = await this.getWorkspaceRepoFilter();
    const groups = await filter.getGroups();

    for (const group of groups) {
      try {
        const users = gitlab.getUsers(group);
        
        for await (const user of users) {
          yield {
            ...user,
            group_path: group,
          };
        }
      } catch (error: any) {
        this.logger.error(`Error fetching users for group ${group}: ${error.message}`);
      }
    }
  }
}
