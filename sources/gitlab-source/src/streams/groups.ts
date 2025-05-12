import {
  AirbyteLogger,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GitLabConfig} from '../types';
import {StreamBase} from './common';

export class Groups extends StreamBase {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any> {
    return require('../../resources/schemas/groups.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  get name(): string {
    return 'gitlab_groups';
  }

  get supportsIncremental(): boolean {
    return false;
  }

  get dependencies(): ReadonlyArray<string> {
    return [];
  }

  get cursorField(): string[] {
    return ['updated_at'];
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

    for (const groupPath of groups) {
      try {
        const group = await gitlab.getGroup(groupPath);
        yield {
          ...group,
          path: groupPath,
        };
      } catch (error: any) {
        this.logger.error(`Error fetching group ${groupPath}: ${error.message}`);
      }
    }
  }
}
