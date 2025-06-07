import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {LaunchDarklyConverter, LaunchDarklyEnvironment} from './common';

export class Environments extends LaunchDarklyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ffs_Environment'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const environment: LaunchDarklyEnvironment = record.record.data as LaunchDarklyEnvironment;

    return [
      {
        model: 'ffs_Environment',
        record: {
          uid: environment.key,
          name: environment.name,
          color: environment.color,
          tags: environment.tags || [],
          source,
        },
      },
    ];
  }
}
