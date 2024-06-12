import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {FarosClient} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {GraphDoctorConfig} from '..';
import {runGraphDoctorTests} from '../graphdoctor';

export class DataQualityTests extends AirbyteStreamBase {
  constructor(
    readonly config: GraphDoctorConfig,
    readonly logger: AirbyteLogger,
    readonly farosClient: FarosClient
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/data-quality-tests.json');
  }

  get primaryKey(): StreamKey {
    return 'id';
  }

  async *readRecords(): AsyncGenerator<any> {
    yield* runGraphDoctorTests(this.config, this.farosClient);
  }
}
