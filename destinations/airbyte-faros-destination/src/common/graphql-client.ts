import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Schema, SchemaLoader} from 'faros-feeds-sdk';
import {EnumType, jsonToGraphQLQuery} from 'json-to-graphql-query';
import {difference, intersection} from 'lodash';
import traverse from 'traverse';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {
  DeletionRecord,
  Operation,
  TimestampedRecord,
  UpdateRecord,
  UpsertRecord,
} from './types';

interface ConflictClause {
  constraint: EnumType;
  update_columns: EnumType[];
}

export interface GraphQLBackend {
  healthCheck(): Promise<void>;
  postQuery(query: any): Promise<any>;
}

interface WriteOp {
  query: string;
  errorMsg: string;
}

export class GraphQLClient {
  private readonly logger = new AirbyteLogger();
  private readonly schemaLoader: SchemaLoader;
  private readonly backend: GraphQLBackend;
  private schema: Schema;
  private tableNames: Set<string>;
  private readonly batchSize: number;
  private readonly writeBuffer: WriteOp[] = [];

  constructor(
    schemaLoader: SchemaLoader,
    backend: GraphQLBackend,
    batchSize = 1
  ) {
    this.schemaLoader = schemaLoader;
    this.backend = backend;
    this.batchSize = batchSize;
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  async healthCheck(): Promise<void> {
    try {
      await this.backend.healthCheck();
    } catch (e) {
      throw new VError(e, 'Failed to check graphql backend health');
    }
  }

  async loadSchema(): Promise<void> {
    this.schema = await this.schemaLoader.loadSchema();
    this.tableNames = new Set(this.schema.tableNames);
  }

  private checkSchema(): void {
    if (!this.schema) {
      throw new VError(
        'Schema is not initialized. Please call loadSchema first.'
      );
    }
  }

  async resetData(
    origin: string,
    models: ReadonlyArray<string>
  ): Promise<void> {
    this.checkSchema();
    for (const model of intersection(
      this.schema.sortedModelDependencies,
      models
    )) {
      this.logger.info(`Resetting ${model} data for origin ${origin}`);
      const deleteConditions = {
        origin: {_eq: origin},
        _not: {
          _or: this.schema.backReferences[model].map((br) => {
            return {
              [br.field]: {},
            };
          }),
        },
      };
      const mutation = {
        [`delete_${model}`]: {
          __args: {
            where: {
              _and: {...deleteConditions},
            },
          },
          affected_rows: true,
        },
      };
      await this.postQuery(
        {mutation},
        `Failed to reset ${model} data for origin ${origin}`
      );
    }
  }

  async writeRecord(
    model: string,
    record: Dictionary<any>,
    origin: string
  ): Promise<void> {
    this.checkSchema();
    if (!this.tableNames.has(model)) {
      throw new VError(`Table ${model} does not exist`);
    }

    const obj = this.createMutationObject(model, origin, record);
    const mutation = {
      [`insert_${model}_one`]: {__args: obj, id: true},
    };
    await this.postQuery({mutation}, `Failed to write ${model} record`);
  }

  async writeTimestampedRecord(record: TimestampedRecord): Promise<void> {
    switch (record.operation) {
      case Operation.UPSERT:
        await this.writeRecord(
          record.model,
          (record as UpsertRecord).data,
          record.origin
        );
        break;
      case Operation.UPDATE:
        await this.writeUpdateRecord(record as UpdateRecord);
        break;
      case Operation.DELETION:
        await this.writeDeletionRecord(record as DeletionRecord);
        break;
      default:
        throw new VError(
          `Unuspported operation ${record.operation} for ${record}`
        );
    }
  }

  private async writeUpdateRecord(record: UpdateRecord): Promise<void> {
    const mutation = {
      [`update_${record.model}`]: {
        __args: {
          where: this.createWhereClause(record.model, record.where),
          _set: this.createMutationObject(
            record.model,
            record.origin,
            record.patch
          ).object,
        },
        returning: {
          id: true,
        },
      },
    };
    await this.postQuery({mutation}, `Failed to update ${record.model} record`);
  }

  private async writeDeletionRecord(record: DeletionRecord): Promise<void> {
    const mutation = {
      [`delete_${record.model}`]: {
        __args: {
          where: this.createWhereClause(record.model, record.where),
        },
        affected_rows: true,
      },
    };
    await this.postQuery({mutation}, `Failed to delete ${record.model} record`);
  }

  private async postQuery(query: any, errorMsg: string): Promise<void> {
    this.writeBuffer.push({
      query,
      errorMsg,
    });
    if (this.writeBuffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    const queries = this.writeBuffer.map((op) => op.query);
    const gql = GraphQLClient.batchMutation(queries);
    if (gql) {
      const res = await this.backend.postQuery(gql);
      if (res.data.errors) {
        this.logger.warn(
          `Error while saving batch: ${JSON.stringify(
            res.data.errors
          )}. Query: ${gql}`
        );
        // now try mutations individually and fail on the first bad one
        for (const op of this.writeBuffer) {
          const opGql = jsonToGraphQLQuery(op.query);
          const opRes = await this.backend.postQuery(opGql);
          this.writeBuffer.shift();
          if (opRes.data.errors) {
            throw new VError(
              `${op.errorMsg} with query '${opGql}': ${JSON.stringify(
                opRes.data.errors
              )}`
            );
          }
        }
      } else {
        // truncate the buffer
        this.writeBuffer.splice(0);
      }
    }
  }

  /**
   * Constructs a gql query from an array of json mutations.
   * The outputted qql mutation might look like:
   *
   *   mutation  {
   *     i1: insert_cicd_Artifact_one(object: {uid: "u1b"}) {
   *       id
   *       refreshedAt
   *     }
   *     i2: insert_cicd_Artifact_one(object: {uid: "u2b"}) {
   *       id
   *       refreshedAt
   *     }
   *   }
   *
   *  Notable here are the i1/i2 aliases.  These are required when multiple operations
   *  share the same name (e.g. insert_cicd_Artifact_one) and are supported in
   *  jsonToGraphQLQuery with __aliasFor directive.
   *
   *  @return batch gql mutation or undefined if the input is undefined, empty
   *  or doesn't contain any mutations.
   */
  static batchMutation(queries: any[]): string | undefined {
    if (queries && queries.length > 0) {
      const queryObj = {};
      queries.forEach((query, idx) => {
        if (query.mutation) {
          const queryType = Object.keys(query.mutation)[0];
          const queryBody = query.mutation[queryType];
          queryObj[`m${idx}`] = {
            __aliasFor: queryType,
            ...queryBody,
          };
        }
      });
      if (Object.keys(queryObj).length > 0) {
        return jsonToGraphQLQuery({mutation: queryObj});
      }
    }
    return undefined;
  }

  private createWhereClause(
    model: string,
    record: Dictionary<any>
  ): Dictionary<any> {
    const obj = {};
    for (const [field, value] of Object.entries(record)) {
      const nestedModel = this.schema.references[model][field];
      if (nestedModel && value) {
        obj[nestedModel.field] = this.createWhereClause(
          nestedModel.model,
          value
        );
      } else {
        const val = this.formatFieldValue(model, field, value);
        if (val) obj[field] = {_eq: val};
      }
    }
    return obj;
  }

  private createMutationObject(
    model: string,
    origin: string,
    record: Dictionary<any>,
    nested?: boolean
  ): {
    data?: Dictionary<any>;
    object?: Dictionary<any>;
    on_conflict: Dictionary<any>;
  } {
    const obj = {};
    for (const [field, value] of Object.entries(record)) {
      const nestedModel = this.schema.references[model][field];
      if (nestedModel && value) {
        obj[nestedModel.field] = this.createMutationObject(
          nestedModel.model,
          origin,
          value,
          true
        );
      } else {
        const val = this.formatFieldValue(model, field, value);
        if (val) obj[field] = val;
      }
    }
    obj['origin'] = origin;
    return {
      [nested ? 'data' : 'object']: obj,
      on_conflict: this.createConflictClause(model, nested),
    };
  }

  private formatFieldValue(model: string, field: string, value: any): any {
    if (!value) return undefined;
    const type = this.schema.scalars[model][field];
    if (!type) {
      this.logger.debug(`Could not find type of ${field} in ${model}`);
      return undefined;
    }
    if (type === 'timestamptz') {
      // The field value may already be a string. E.g., if coming from the Faros Feeds source.
      return typeof value === 'string' ? value : timestamptz(value);
    } else if (typeof value === 'object' || Array.isArray(value)) {
      return traverse(value).map(function (this, val) {
        if (val instanceof Date) {
          this.update(val.getTime());
        }
      });
    }
    return value;
  }

  private createConflictClause(
    model: string,
    nested?: boolean
  ): ConflictClause {
    const updateColumns = nested
      ? ['refreshedAt']
      : difference(
          Object.keys(this.schema.scalars[model]),
          this.schema.primaryKeys[model]
        );
    return {
      constraint: new EnumType(`${model}_pkey`),
      update_columns: updateColumns.map((c) => new EnumType(c)),
    };
  }
}

function timestamptz(date: Date): string {
  return dateformat.asString(dateformat.ISO8601_WITH_TZ_OFFSET_FORMAT, date);
}
