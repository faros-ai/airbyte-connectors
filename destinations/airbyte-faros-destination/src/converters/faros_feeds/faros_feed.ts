import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGraphSchema} from 'faros-feeds-sdk';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {ALL_MODEL_NAMES} from './model_names';

export class FarosFeed extends Converter {
  source = 'Faros_Feeds';

  readonly destinationModels: ReadonlyArray<DestinationModel> = ALL_MODEL_NAMES;

  private schema: FarosGraphSchema = undefined;

  id(record: AirbyteRecord): any {
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

    // Ignore full model deletion records. E.g., {"vcs_TeamMembership__Deletion":{"where":"my-source"}}
    if (model.endsWith('__Deletion') && Object.entries(rec).length == 1) {
      const [key, value] = Object.entries(rec).pop();
      if (key === 'where' && typeof value == 'string') return [];
    }

    if (this.schema) {
      if (model.endsWith('__Update')) {
        for (const key of ['mask', 'patch', 'where']) {
          this.schema.fixTimestampFields(
            rec[key],
            model.replace('__Update', '')
          );
        }
      } else if (model.endsWith('__Deletion')) {
        this.schema.fixTimestampFields(
          rec['where'],
          model.replace('__Deletion', '')
        );
      } else if (model.endsWith('__Upsert')) {
        this.schema.fixTimestampFields(rec, model.replace('__Upsert', ''));
      } else {
        this.schema.fixTimestampFields(rec, model);
      }
    }

    return [{model, record: rec}];
  }
}
