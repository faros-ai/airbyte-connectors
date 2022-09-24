import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Buildkite, BuildkiteConfig, Pipeline} from '../buildkite/buildkite';
export class Pipelines extends AirbyteStreamBase {
  constructor(
    private readonly config: BuildkiteConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/pipelines.json');
  }
  get primaryKey(): StreamKey {
    return 'id';
  }
  async *readRecords(): AsyncGenerator<Pipeline> {
    const buildkite = Buildkite.instance(this.config, this.logger);
    yield* buildkite.getPipelines();
  }
}
