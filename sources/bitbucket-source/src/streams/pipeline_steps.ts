import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {PipelineStep} from 'faros-airbyte-common/bitbucket';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket';
import {BitbucketConfig} from '../types';
import {Pipelines} from './pipelines';

type StreamSlice = {workspace: string; repository: string; pipeline: string};

export class PipelineSteps extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly pipelines: Pipelines,
    readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipeline_steps.json');
  }
  get primaryKey(): StreamKey {
    return 'uuid';
  }

  async *streamSlices(): AsyncGenerator<StreamSlice> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const workspace of this.config.workspaces) {
      for (const repo of await bitbucket.getRepositories(
        workspace,
        this.config.repositories
      )) {
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
