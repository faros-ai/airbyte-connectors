import {
  AirbyteLogger,
  AirbyteStreamBase,
  StreamKey,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Bitbucket} from '../bitbucket/bitbucket';
import {BitbucketConfig, PipelineStep} from '../bitbucket/types';
import {Pipelines} from './pipelines';

type StreamSlice =
  | {workspace: string; repository: string; pipeline: string}
  | undefined;

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

  async *streamSlices(
    syncMode: SyncMode,
    cursorField?: string[],
    streamState?: Dictionary<any>
  ): AsyncGenerator<StreamSlice> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);
    for (const workspace of this.config.workspaces) {
      for (const repo of await bitbucket.getRepositories(workspace)) {
        const pipelines = this.pipelines.readRecords(
          SyncMode.FULL_REFRESH,
          undefined,
          {workspace, repository: repo.slug}
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
    streamSlice?: StreamSlice,
    streamState?: Dictionary<any>
  ): AsyncGenerator<PipelineStep> {
    const bitbucket = Bitbucket.instance(this.config, this.logger);

    const workspace = streamSlice.workspace;
    const repoSlug = streamSlice.repository;
    const pipeline = streamSlice.pipeline;
    yield* bitbucket.getPipelineSteps(workspace, repoSlug, pipeline);
  }
}
