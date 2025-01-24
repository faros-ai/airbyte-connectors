import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGraphSchema} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from '../converter';
import {ALL_MODEL_NAMES} from './model_names';

interface FarosFeedsRecord {
  id: number;
  record?: Dictionary<any>;
}

interface ModelRecord {
  model: string;
  rec: Dictionary<any>;
}

function isFarosFeedsRecord(data: Dictionary<any>): data is FarosFeedsRecord {
  return (
    'id' in data &&
    data.record &&
    typeof data.record === 'object' &&
    Object.keys(data.record).length === 1
  );
}

function getModelRecord(data: Dictionary<any>): ModelRecord | undefined {
  if (isFarosFeedsRecord(data)) {
    const [model, rec] = Object.entries(data.record).pop();
    return {model, rec};
  } else if (Object.keys(data).length === 1) {
    // support previous farosai/airbyte-faros-feeds-source versions
    const [model, rec] = Object.entries(data).pop();
    return {model, rec};
  }
  return undefined;
}

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

    const modelRecord = getModelRecord(data);
    if (!modelRecord) return [];
    const {model, rec} = modelRecord;

    // Full model deletion records.
    // E.g., {"vcs_TeamMembership__Deletion":{"where":"my-source"}}
    // These are issued by the feed and are only applicable to the V1 API
    // Transform them into resets for the v2 API
    // We accumulate the model names in 'resetModels' to reset them in topological order
    if (model.endsWith('__Deletion') && Object.entries(rec).length == 1) {
      const [key, value] = Object.entries(rec).pop();
      if (key === 'where' && typeof value == 'string') {
        const [baseModel] = model.split('__', 1);
        ctx.registerStreamResetModels('faros_feed', new Set([baseModel]));
        return [];
      }
    }

    if (this.schema) {
      this.schema.fixTimestampFields(rec, model);
    }

    return [{model, record: rec}];
  }
}
