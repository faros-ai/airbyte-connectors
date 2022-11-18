import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Schema, SchemaLoader} from 'faros-feeds-sdk';
import {EnumType, jsonToGraphQLQuery} from 'json-to-graphql-query';
import {
  clone,
  difference,
  get,
  groupBy,
  intersection,
  isEmpty,
  isNil,
  keys,
  pick,
  reverse,
} from 'lodash';
import traverse from 'traverse';
import {assert, Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {
  DeletionRecord,
  Operation,
  TimestampedRecord,
  UpdateRecord,
  UpsertRecord,
} from './types';

const MULTI_TENANT_FIELDS = ['tenantId', 'graphName'];

interface ConflictClause {
  constraint: EnumType;
  update_columns: EnumType[];
}

export interface GraphQLBackend {
  healthCheck(): Promise<void>;

  postQuery(query: any): Promise<any>;
}

interface WriteOp {
  query: any;
  errorMsg: string;
}

interface UpsertOp {
  query: any;
  upsertsByKey: Map<string, Upsert[]>;
}

interface Upsert {
  id?: string; // will be set after object is inserted
  model: string;
  object: Dictionary<any>;
  foreignKeys: Dictionary<Upsert>;
}

export class UpsertBuffer {
  private readonly upsertBuffer: Map<string, Upsert[]> = new Map();

  add(upsert: Upsert): void {
    if (!this.upsertBuffer.has(upsert.model)) {
      this.upsertBuffer.set(upsert.model, []);
    }
    const modelBuffer = this.upsertBuffer.get(upsert.model);
    modelBuffer.push(upsert);
  }

  size(): number {
    return Array.from(this.upsertBuffer.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
  }

  get(model: string, remove = true): Upsert[] | undefined {
    if (this.upsertBuffer.has(model)) {
      const modelUpserts = this.upsertBuffer.get(model);
      if (remove) {
        this.upsertBuffer.delete(model);
      }
      return modelUpserts;
    }
    return undefined;
  }

  clear(): number {
    const size = this.size();
    this.upsertBuffer.clear();
    return size;
  }
}

export function serialize(obj: any): string {
  return keys(obj)
    .sort()
    .map((k) => `${k}:${obj[k]}`)
    .join('|');
}

/**
 * Like lodash pick but with null value replacement.
 */
export function strictPick(obj: any, keys: string[], nullValue = 'null'): any {
  const result = {};
  keys.forEach((key) => {
    const v = obj[key];
    result[key] = v ? v : nullValue;
  });
  return result;
}

/**
 * Groups objects by primary key and then merges all related objects into
 * a single object where last-wins for overlapping properties.
 */
export function mergeByPrimaryKey(
  objects: any[],
  primaryKeys: string[]
): any[] {
  const byPK = groupBy(objects, (o) => serialize(pick(o, primaryKeys)));
  return Object.values(byPK).map((arr) =>
    arr.reduce((acc, obj) => ({...acc, ...obj}), {})
  );
}

export class GraphQLClient {
  private readonly logger: AirbyteLogger;
  private readonly schemaLoader: SchemaLoader;
  private readonly backend: GraphQLBackend;
  private schema: Schema;
  private tableNames: Set<string>;
  private fieldsByModel: Map<string, Set<string>>;
  private tableDependencies: string[];
  private readonly mutationBatchSize: number;
  private readonly upsertBatchSize: number;
  private readonly writeBuffer: WriteOp[] = [];
  private readonly upsertBuffer = new UpsertBuffer();

  constructor(
    logger: AirbyteLogger,
    schemaLoader: SchemaLoader,
    backend: GraphQLBackend,
    upsertBatchSize = 1000,
    mutationBatchSize = 1
  ) {
    this.logger = logger;
    this.schemaLoader = schemaLoader;
    this.backend = backend;
    this.upsertBatchSize = upsertBatchSize;
    this.mutationBatchSize = mutationBatchSize;
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
    this.fieldsByModel = new Map();
    for (const [model, fields] of Object.entries(this.schema.scalars)) {
      this.fieldsByModel.set(model, new Set(Object.keys(fields)));
    }
    this.tableDependencies = [...this.schema.sortedModelDependencies];
    reverse(this.tableDependencies);
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
    this.addUpsert(model, origin, record);
    if (this.upsertBuffer.size() >= this.upsertBatchSize) {
      await this.flushUpsertBuffer();
    }
  }

  private async flushUpsertBuffer(): Promise<void> {
    try {
      await this.doFlushUpsertBuffer();
    } catch (e) {
      const numRemoved = this.upsertBuffer.clear();
      throw new VError(
        e,
        'failed to flush upsert buffer. abandoned %d records',
        numRemoved
      );
    }
  }

  private async doFlushUpsertBuffer(): Promise<void> {
    for (const model of this.tableDependencies) {
      const {query, upsertsByKey} = this.toUpsertOp(model);
      if (query) {
        try {
          const opGql = jsonToGraphQLQuery(query);
          const opRes = await this.backend.postQuery(opGql);
          const paths = keys(opRes.data);
          assert(paths.length === 1, `expected one element in ${paths}`);
          const nextKey = paths[0];
          const objects = get(opRes.data, `${nextKey}.returning`);
          assert(Array.isArray(objects), `expected array`);
          // assign ids to all upserts related to this object
          for (const obj of objects) {
            const key = this.serializedPrimaryKey(model, obj);
            const upserts = upsertsByKey.get(key);
            assert(
              upserts,
              `failed to resolve upserts for ${model} and ${key}`
            );
            assert(
              obj.id,
              `failed to resolve id for ${model} and ${JSON.stringify(obj)}`
            );
            upserts.forEach((u) => (u.id = obj.id));
          }
        } catch (e) {
          throw new VError(e, `failed to write upserts for ${model}`);
        }
      }
    }
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
          `Unsupported operation ${record.operation} for ${record}`
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
    if (this.writeBuffer.length >= this.mutationBatchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    await Promise.all([this.flushWriteBuffer(), this.flushUpsertBuffer()]);
  }

  async flushWriteBuffer(): Promise<void> {
    const queries = this.writeBuffer.map((op) => op.query);
    const gql = GraphQLClient.batchMutation(queries);
    if (gql) {
      this.logger.debug(`executing graphql query: ${gql}`);
      const res = await this.backend.postQuery(gql);
      if (res.errors) {
        this.logger.warn(
          `Error while saving batch: ${JSON.stringify(
            res.errors
          )}. Query: ${gql}`
        );
        // now try mutations individually and fail on the first bad one
        for (const op of this.writeBuffer) {
          const opGql = jsonToGraphQLQuery(op.query);
          const opRes = await this.backend.postQuery(opGql);
          this.writeBuffer.shift();
          if (opRes.errors) {
            throw new VError(
              `${op.errorMsg} with query '${opGql}': ${JSON.stringify(
                opRes.errors
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
        if (!isNil(val)) obj[field] = val;
      }
    }
    obj['origin'] = origin;
    return {
      [nested ? 'data' : 'object']: obj,
      on_conflict: this.createConflictClause(model, nested),
    };
  }

  private addUpsert(
    model: string,
    origin: string,
    record: Dictionary<any>
  ): Upsert {
    const object = {};
    const foreignKeys: Dictionary<Upsert> = {};
    for (const [field, value] of Object.entries(record)) {
      const nestedModel = this.schema.references[model][field];
      if (nestedModel && value) {
        foreignKeys[field] = this.addUpsert(nestedModel.model, origin, value);
      } else {
        const val = this.formatFieldValue(model, field, value);
        if (!isNil(val)) object[field] = val;
      }
    }
    object['origin'] = origin;
    const upsert = {
      model,
      object,
      foreignKeys: foreignKeys,
    };
    // index by model
    this.upsertBuffer.add(upsert);
    return upsert;
  }

  objectWithForeignKeys(upsert: Upsert): Dictionary<any> {
    if (isEmpty(upsert.foreignKeys)) {
      return upsert.object;
    }
    const result = clone(upsert.object);
    for (const [relName, fkUpsert] of Object.entries(upsert.foreignKeys)) {
      const modelFields = this.fieldsByModel.get(upsert.model);
      // check if relName is a column (CE case) otherwise suffix with id (SaaS case)
      const fkField = modelFields.has(relName) ? relName : `${relName}Id`;
      assert(
        modelFields.has(fkField),
        `invalid fk field for ${upsert.model}: ${fkField}`
      );
      const fkValue = fkUpsert.id;
      assert(
        !isNil(fkValue),
        `failed to resolve fk value for ${relName} from ${JSON.stringify(
          fkUpsert
        )}`
      );
      result[fkField] = fkValue;
    }
    return result;
  }

  /**
   * returns serialized version of keys fields
   */
  private serializedPrimaryKey(model: string, obj: any): string {
    return serialize(strictPick(obj, this.primaryKeys(model)));
  }

  private primaryKeys(model: string): string[] {
    // we cannot access multi-tenant fields
    // this should probably be removed from schema
    return difference(this.schema.primaryKeys[model], MULTI_TENANT_FIELDS);
  }

  toUpsertOp(model: string): UpsertOp | undefined {
    const modelUpserts = this.upsertBuffer.get(model);
    if (modelUpserts) {
      const upsertsByKey = new Map();
      const all = modelUpserts.map((u) => {
        const fullObj = this.objectWithForeignKeys(u);
        const key = this.serializedPrimaryKey(model, fullObj);
        if (!upsertsByKey.has(key)) {
          upsertsByKey.set(key, []);
        }
        upsertsByKey.get(key).push(u);
        return fullObj;
      });
      const primaryKeys = this.primaryKeys(model);
      const objects = mergeByPrimaryKey(all, primaryKeys);
      const keysObj = primaryKeys
        .sort()
        .reduce((a, v) => ({...a, [v]: true}), {});
      const mutation = {
        mutation: {
          [`insert_${model}`]: {
            __args: {
              objects,
              on_conflict: this.createConflictClause(model, false),
            },
            returning: {
              id: true,
              ...keysObj,
            },
          },
        },
      };
      return {
        query: mutation,
        upsertsByKey,
      };
    }
    return undefined;
  }

  private formatFieldValue(model: string, field: string, value: any): any {
    if (isNil(value)) return undefined;
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
