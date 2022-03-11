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

type StreamSlice = {repository?: string; pipeline?: string} | undefined;

export class PipelineSteps extends AirbyteStreamBase {
  constructor(
    readonly config: BitbucketConfig,
    readonly repositories: string[],
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
    for (const repository of this.repositories) {
      const pipelines = this.pipelines.readRecords(
        SyncMode.FULL_REFRESH,
        undefined,
        {repository}
      );
      for await (const pipeline of pipelines) {
        yield {repository, pipeline: pipeline.uuid};
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

    const repoSlug = streamSlice.repository;
    const pipeline = streamSlice.pipeline;
    yield* bitbucket.getPipelineSteps(repoSlug, pipeline);
  }
}
