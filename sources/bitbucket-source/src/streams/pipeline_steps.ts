import {AirbyteLogger, StreamKey, SyncMode} from 'faros-airbyte-cdk';
import {PipelineStep} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig} from '../types';
import {StreamBase} from './common';
import {Pipelines} from './pipelines';

type StreamSlice = {workspace: string; repository: string; pipeline: string};

export class PipelineSteps extends StreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly pipelines: Pipelines,
    readonly logger: AirbyteLogger
  ) {
    super(config, logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipeline_steps.json');
  }
  get primaryKey(): StreamKey {
    return 'uuid';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const workspaces = await this.workspaceRepoFilter.getWorkspaces();
    for (const workspace of workspaces) {
      const repos = await this.workspaceRepoFilter.getRepositories(workspace);
      for (const repo of repos) {
        const pipelines = this.pipelines.readRecords(
          SyncMode.FULL_REFRESH,
          undefined,
          {workspace, repo: repo.slug}
        );
        for await (const pipeline of pipelines) {
          yield {workspace, repository: repo.slug, pipeline: pipeline.uuid};
        }
      }
    }
  }

  async *readRecords(
    syncMode: SyncMode,
    cursorField?: string[],
    streamSlice?: StreamSlice
  ): AsyncGenerator<PipelineStep> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const workspace = streamSlice.workspace;
    const repoSlug = streamSlice.repository;
    const pipeline = streamSlice.pipeline;
    yield* bitbucket.getPipelineSteps(workspace, repoSlug, pipeline);
  }
}
