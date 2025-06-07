import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {LaunchDarklyConverter, LaunchDarklyFeatureFlag} from './common';

export class FeatureFlags extends LaunchDarklyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ffs_FeatureFlag'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const flag: LaunchDarklyFeatureFlag = record.record.data as LaunchDarklyFeatureFlag;

    return [
      {
        model: 'ffs_FeatureFlag',
        record: {
          uid: flag.key,
          name: flag.name,
          kind: flag.kind,
          description: flag.description,
          tags: flag.tags || [],
          source,
        },
      },
    ];
  }
}
