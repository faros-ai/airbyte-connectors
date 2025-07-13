import {
  AirbyteLogger,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {FarosPipelineOutput} from 'faros-airbyte-common/gitlab';
import {FarosClient, Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {GitLabConfig} from '../types';
import {
  ProjectStreamSlice,
  StreamBase,
  StreamState,
  StreamWithProjectSlices,
} from './common';

export class FarosPipelines extends StreamWithProjectSlices {
  constructor(
    protected readonly config: GitLabConfig,
    protected readonly logger: AirbyteLogger,
    protected readonly farosClient?: FarosClient
  ) {
    super(config, logger, farosClient);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosPipelines.json');
  }

  get primaryKey(): StreamKey {
    return ['id', 'iid'];
  }

  get cursorField(): string | string[] {
    return 'updated_at';
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: Dictionary<any>,
    streamState?: Dictionary<any>
  ): AsyncGenerator<Dictionary<any>> {
    const projectSlice = streamSlice as ProjectStreamSlice;
    const projectPath = projectSlice?.path_with_namespace;
    if (!projectPath) {
      return;
    }

    const gitlab = await GitLab.instance(this.config, this.logger);
    const state = streamState?.[StreamBase.groupProjectKey(projectSlice.group_id, projectPath)];
    const [since] = this.getUpdateRange(state?.cutoff);

    for await (const pipeline of gitlab.getPipelines(projectPath, since)) {
      const user = pipeline.user as any;
      let authorUsername: string | null = null;
      if (user?.username) {
        authorUsername = user.username;
      }

      yield {
        ...pipeline,
        group_id: projectSlice.group_id,
        project_path: projectPath,
        author_username: authorUsername,
      };
    }
  }

  getUpdatedState(
    currentStreamState: Dictionary<any>,
    latestRecord: Dictionary<any>,
    streamSlice: Dictionary<any>
  ): Dictionary<any> {
    const projectSlice = streamSlice as ProjectStreamSlice;
    const projectKey = StreamBase.groupProjectKey(projectSlice.group_id, projectSlice.path_with_namespace);
    const latestRecordCutoff = Utils.toDate(latestRecord?.updated_at);

    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      projectKey
    );
  }
}
