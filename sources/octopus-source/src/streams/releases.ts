import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Release} from '../models';
import {Octopus, OctopusConfig} from '../octopus';

export class Releases extends AirbyteStreamBase {
  constructor(
    private readonly config: OctopusConfig,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/releases.json');
  }
  get primaryKey(): StreamKey {
    return 'Id';
  }

  async *readRecords(): AsyncGenerator<Release> {
    const octopus = await Octopus.instance(this.config, this.logger);
    yield* octopus.getReleases();
  }
}
