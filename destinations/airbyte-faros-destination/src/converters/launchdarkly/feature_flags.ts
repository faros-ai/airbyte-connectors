import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {LaunchDarklyConverter, LaunchDarklyFeatureFlag} from './common';

export class FeatureFlags extends LaunchDarklyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ffs_FeatureFlag', 'ffs_Variation'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const flag: LaunchDarklyFeatureFlag = record.record.data as LaunchDarklyFeatureFlag;
    const results: DestinationRecord[] = [];

    const defaultVariationId = flag.defaults?.onVariation !== undefined && flag.variations?.[flag.defaults.onVariation]
      ? `${flag.key}-variation-${flag.defaults.onVariation}`
      : `${flag.key}-variation-0`;

    results.push({
      model: 'ffs_FeatureFlag',
      record: {
        id: flag.key,
        projectId: 'default', // LaunchDarkly flags don't have explicit project association in API
        key: flag.key,
        description: flag.description || null,
        archived: flag.archived || false,
        createdAt: flag.creationDate ? new Date(flag.creationDate).toISOString() : null,
        defaultVariationId,
        source,
      },
    });

    if (flag.variations && flag.variations.length > 0) {
      flag.variations.forEach((variation, index) => {
        results.push({
          model: 'ffs_Variation',
          record: {
            id: variation._id || `${flag.key}-variation-${index}`,
            flagId: flag.key,
            value: variation.value,
            name: variation.name || null,
            weight: null, // Weight is typically set per environment, not globally
            source,
          },
        });
      });
    }

    return results;
  }
}
