import {ok} from 'assert';
import {AirbyteRecord} from 'faros-airbyte-cdk';
import {FarosGraphSchema} from 'faros-js-client';
import jsonata from 'jsonata';
import {VError} from 'verror';

import {
  Converter,
  DestinationModel,
  DestinationRecord,
  StreamContext,
} from './converter';
import {ALL_MODEL_NAMES} from './faros-feeds/model_names';

/** Record converter to convert records using provided JSONata expression */
export class JSONataConverter extends Converter {
  source = 'JSONata';

  private schema: FarosGraphSchema = undefined;

  constructor(
    private readonly jsonataExpr: jsonata.Expression,
    readonly destinationModels: ReadonlyArray<DestinationModel>
  ) {
    super();
  }

  id(): any {
    return undefined;
  }

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!this.schema && ctx?.farosClient && ctx?.graph) {
      this.schema = new FarosGraphSchema(
        await ctx.farosClient.introspect(ctx.graph)
      );
    }

    let jsonataResult = this.jsonataExpr.evaluate(record.record);
    if (!jsonataResult) return [];
    if (!Array.isArray(jsonataResult)) jsonataResult = [jsonataResult];

    const res = [];
    for (const result of jsonataResult) {
      // We expect each jsonata result to conform to:
      // { '<model>': {<record data>} } or
      // { '<model>__<operation>': {<record data>} }
      ok(
        Object.keys(result).length == 1,
        'jsonata result should contain a single key'
      );

      const [model, rec] = Object.entries(result).pop();

      if (this.schema) {
        this.schema.fixTimestampFields(rec, model);
      }

      res.push({model, record: rec});
    }

    return res;
  }

  static make(
    expression: string,
    destinationModels: ReadonlyArray<DestinationModel>
  ): JSONataConverter {
    if (!Array.isArray(destinationModels) || !destinationModels.length) {
      throw new VError('Destination models cannot be empty');
    }
    try {
      const jsonataExpr = jsonata(expression);
      if (destinationModels[0] === '*') {
        return new JSONataConverter(jsonataExpr, ALL_MODEL_NAMES);
      } else {
        return new JSONataConverter(jsonataExpr, destinationModels);
      }
    } catch (error: any) {
      throw new VError(
        error,
        'Failed to parse JSONata expression: %s (code: %s, position: %s, token: %s)',
        error.message,
        error.code,
        error.position,
        error.token
      );
    }
  }
}

export enum JSONataApplyMode {
  FALLBACK = 'FALLBACK',
  OVERRIDE = 'OVERRIDE',
}
