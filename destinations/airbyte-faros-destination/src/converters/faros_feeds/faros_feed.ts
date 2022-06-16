import {AirbyteRecord} from 'faros-airbyte-cdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {ALL_MODEL_NAMES} from './model_names';

export class FarosFeed extends Converter {
  source = 'Faros_Feeds';

  id(record: AirbyteRecord) {
    return undefined;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = ALL_MODEL_NAMES;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const data = record.record.data;

    if (data.state) return [];
    if (Object.keys(data).length != 1) return [];

    const [model, rec] = Object.entries(data).pop();

    // Ignore full model deletion records. E.g., {"vcs_TeamMembership__Deletion":{"where":"my-source"}}
    if (model.endsWith('__Deletion') && Object.entries(rec).length == 1) {
      const [key, value] = Object.entries(rec).pop();
      if (key === 'where' && typeof value == 'string') return [];
    }

    return [{model, record: rec}];
  }
}
