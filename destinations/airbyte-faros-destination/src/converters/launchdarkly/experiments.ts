import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord} from '../converter';
import {LaunchDarklyConverter, LaunchDarklyExperiment} from './common';

export class Experiments extends LaunchDarklyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = ['ffs_Experiment'];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const source = this.streamName.source;
    const experiment: LaunchDarklyExperiment = record.record.data as LaunchDarklyExperiment;

    return [
      {
        model: 'ffs_Experiment',
        record: {
          id: experiment.key,
          flagId: 'unknown', // LaunchDarkly experiments don't always have explicit flag association in basic API
          name: experiment.name,
          status: 'running', // Default status since LaunchDarkly API doesn't provide this in basic experiment data
          startAt: experiment.creationDate ? new Date(experiment.creationDate).toISOString() : null,
          endAt: null, // Not provided in basic experiment data
          source,
        },
      },
    ];
  }
}
