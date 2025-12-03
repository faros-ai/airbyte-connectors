import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {HarnessNextgenConverter, HarnessNextgenEnvironment} from './common';

export class Environments extends HarnessNextgenConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    // Environments are used for reference in executions
    // No direct Faros model mapping needed as environment info
    // is included in deployment records
    return [];
  }
}
