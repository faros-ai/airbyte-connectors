import {v1} from '@datadog/datadog-api-client';
import {AirbyteLogger, AirbyteStreamBase, StreamKey} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {Datadog} from '../datadog';

export class ServiceLevelObjectives extends AirbyteStreamBase {
  constructor(
    private readonly datadog: Datadog,
    protected readonly logger: AirbyteLogger
  ) {
    super(logger);
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/slo.json');
  }

  get primaryKey(): StreamKey {
    return ['id'];
  }

  async *readRecords(): AsyncGenerator<v1.SearchServiceLevelObjectiveData> {
    yield* this.datadog.getServiceLevelObjectivess();
  }
}
