import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGraphSchema} from 'faros-js-client';

import {Edition} from '../../common/types';
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
  private resetModels: Set<string> = new Set();
  private hasResetModels = false;

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

    if (
      ctx.config.edition_configs.edition === Edition.COMMUNITY ||
      ctx.config.edition_configs.graphql_api === 'v2'
    ) {
      // Full model deletion records.
      // E.g., {"vcs_TeamMembership__Deletion":{"where":"my-source"}}
      // These are issued by the feed and are only applicable to the V1 API
      // We accumulate the model names in 'deleteModelEntries' to reset them in topological order
      if (model.endsWith('__Deletion') && Object.entries(rec).length == 1) {
        const [key, value] = Object.entries(rec).pop();
        if (key === 'where' && typeof value == 'string') {
          const [baseModel] = model.split('__', 1);
          this.resetModels.add(baseModel);
          return [];
        }
      } else {
        if (!this.hasResetModels && this.resetModels.size > 0) {
          if (ctx.resetData) {
            this.hasResetModels = true;
            await ctx.resetData(Array.from(this.resetModels));
          } else {
            // This is okay when dry run is enabled
            ctx.logger?.warn(
              `Ignored full model deletion records for ${Array.from(
                this.resetModels
              ).join()}`
            );
          }
        }
      }
    }

    if (this.schema) {
      this.schema.fixTimestampFields(rec, model);
    }

    return [{model, record: rec}];
  }
}
