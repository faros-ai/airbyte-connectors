import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGraphSchema} from 'faros-js-client';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {ALL_MODEL_NAMES} from './model_names';

export class FarosFeed extends Converter {
  source = 'Faros-Feeds';

  readonly destinationModels: ReadonlyArray<DestinationModel> = ALL_MODEL_NAMES;

  private schema: FarosGraphSchema = undefined;

  id(): any {
    return undefined;
  }

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!this.schema && ctx.farosClient && ctx.graph) {
      this.schema = new FarosGraphSchema(
        await ctx.farosClient.introspect(ctx.graph)
      );
    }

    const data = record.record.data;

    if (data.state) return [];
    if (Object.keys(data).length != 1) return [];

    const [model, rec] = Object.entries(data).pop();

    if (this.schema) {
      this.schema.fixTimestampFields(rec, model);
    }

    return [{model, record: rec}];
  }
}
