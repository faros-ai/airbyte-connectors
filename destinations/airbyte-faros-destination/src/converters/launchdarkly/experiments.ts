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
          uid: experiment.key,
          name: experiment.name,
          description: experiment.description,
          hypothesis: experiment.hypothesis,
          source,
        },
      },
    ];
  }
}
