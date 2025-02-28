import {v2} from '@datadog/datadog-api-client';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {DatadogConverter} from './common';
export class Users extends DatadogConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ims_User'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const user = record.record.data as v2.User;

    return [
      {
        model: 'ims_User',
        record: {
          uid: user?.id,
          email: user?.attributes?.email,
          name: user?.attributes?.name,
          source,
        },
      },
    ];
  }
}
