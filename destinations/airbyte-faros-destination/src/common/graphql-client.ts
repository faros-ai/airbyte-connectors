import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Schema, SchemaLoader} from 'faros-feeds-sdk';
import {EnumType, jsonToGraphQLQuery} from 'json-to-graphql-query';
import {
  clone,
  difference,
  flatMap,
  get,
  groupBy,
  intersection,
  isEmpty,
  isNil,
  keys,
  max,
  pick,
  reverse,
  set,
  unzip,
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

interface ConflictClause {
  constraint: EnumType;
  update_columns: EnumType[];
}

export interface GraphQLBackend {
  healthCheck(): Promise<void>;

  postQuery(query: any): Promise<any>;
}

interface WriteOp {
  readonly query: any;
  readonly errorMsg: string;
}

interface UpsertOp {
  readonly query: any;
  readonly upsertsByKey: Map<string, Upsert[]>;
}

export interface Upsert {
  id?: string; // will be set after object is inserted
  readonly model: string;
  readonly object: Dictionary<any>;
  readonly foreignKeys: Dictionary<Upsert>;
}

interface UpsertResult {
  readonly model: string;
  readonly numObjects: number;
  readonly durationMs: number;
}

export class UpsertBuffer {
  private readonly upsertBuffer: Map<string, Upsert[]> = new Map();

  add(upsert: Upsert): void {
    const modelBuffer = this.upsertBuffer.get(upsert.model);
    if (!modelBuffer) {
      this.upsertBuffer.set(upsert.model, [upsert]);
      return;
    }
    modelBuffer.push(upsert);
  }

  size(): number {
    return Array.from(this.upsertBuffer.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
  }

  pop(model: string): Upsert[] | undefined {
    return this.getInternal(model, true);
  }

  get(model: string): Upsert[] | undefined {
    return this.getInternal(model, false);
  }

  private getInternal(model: string, remove: boolean): Upsert[] | undefined {
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
  return keys.reduce(
    (result, key) => set(result, key, obj[key] || nullValue),
    {}
  );
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

/**
 * Execute async callback for each batch of upserts.
 */
export function batchIterator<T>(
  batches: Upsert[][],
  callback: (batch: Upsert[]) => Promise<T>
): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<T> {
      for (const batch of batches) {
        yield await callback(batch);
      }
    },
  };
}

/**
 * Separates upserts into levels. Level 0 has no dependencies on other levels.
 * Level 1 depends on Level 0, 2 on 1 and so on.
 */
export function toLevels(upserts: Upsert[]): Upsert[][] {
  const withLevel: [Upsert, number][] = flatMap(upserts, (u) => addLevel(u));
  const byLevel: Dictionary<[Upsert, number][]> = groupBy(
    withLevel,
    (tuple) => tuple[1]
  );
  const result = [];
  Object.keys(byLevel)
    .sort()
    .forEach((level) => {
      result.push(unzip(byLevel[level])[0]);
    });
  return result;
}

/**
 * Converts an Upsert (which is a tree structure) into an array of tuples.
 * Each tuple contains an Upsert and its level in the tree structure.
 * The level indicates the number of steps from a leaf where leaves are level 0.
 * If an Upsert has multiple paths to a leaf, the level is the maximum number of
 * steps.
 */
function addLevel(u: Upsert, level = 0): [Upsert, number][] {
  const result = [];
  let maxAncestorLevel = 0;
  for (const ancestor of Object.values(u.foreignKeys)) {
    if (ancestor.model === u.model) {
      const ancestorsWithLevels = addLevel(ancestor, level + 1);
      maxAncestorLevel = max([ancestorsWithLevels[0][1], maxAncestorLevel]);
      result.push(...ancestorsWithLevels);
    }
  }
  const thisLevel = result.length ? maxAncestorLevel + 1 : 0;
  result.unshift([u, thisLevel]);
  return result;
}

export class GraphQLClient {
  private readonly logger: AirbyteLogger;
  private readonly schemaLoader: SchemaLoader;
  private readonly backend: GraphQLBackend;
  private schema: Schema;
  private tableNames: Set<string>;
  private tableDependencies: string[];
  private readonly mutationBatchSize: number;
  private readonly upsertBatchSize: number;
  private readonly writeBuffer: WriteOp[] = [];
  private readonly upsertBuffer = new UpsertBuffer();
  private readonly selfReferentModels = new Set();

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
    // various derivative values of schema
    this.tableNames = new Set(this.schema.tableNames);
    this.tableDependencies = [...this.schema.sortedModelDependencies];
    reverse(this.tableDependencies);
    // self-referent models
    for (const [model, modelRefs] of Object.entries(this.schema.references)) {
      for (const reference of Object.values(modelRefs)) {
        if (reference.model === model) {
          this.selfReferentModels.add(model);
        }
      }
    }
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

  private async execUpsert(model: string, op: UpsertOp): Promise<UpsertResult> {
    // write batch
    const opGql = jsonToGraphQLQuery(op.query);
    const start = Date.now();
    const opRes = await this.backend.postQuery(opGql);
    const end = Date.now();
    // extract ids of newly written records and set on upserts.
    // the ids are used as foreign keys by subsequent batches
    // step 1: access array of results
    // will be at path 'opRes.data.insert_<model>.returning'
    const paths = keys(opRes.data);
    assert(paths.length === 1, `expected one element in ${paths}`);
    const objects = get(opRes.data, `${paths[0]}.returning`);
    assert(Array.isArray(objects), `expected array`);
    for (const obj of objects) {
      // step 2: assign id to all upserts related to this object
      // construct key from returned result and lookup upsert by key
      const key = this.serializedPrimaryKey(model, obj);
      const upserts = op.upsertsByKey.get(key);
      assert(upserts, `failed to resolve upserts for ${model} and ${key}`);
      assert(
        obj.id,
        `failed to resolve id for ${model} and ${JSON.stringify(obj)}`
      );
      upserts.forEach((u) => (u.id = obj.id));
    }
    return {
      model,
      numObjects: objects.length,
      durationMs: end - start,
    };
  }

  private async doFlushUpsertBuffer(): Promise<void> {
    for (const model of this.tableDependencies) {
      const modelUpserts = this.upsertBuffer.pop(model);
      if (modelUpserts) {
        const withLevels = this.selfReferentModels.has(model)
          ? toLevels(modelUpserts)
          : [modelUpserts];
        const iterator: AsyncIterable<UpsertResult> = batchIterator(
          withLevels,
          (batch) => {
            return this.execUpsert(model, this.toUpsertOp(model, batch));
          }
        );
        try {
          for await (const result of iterator) {
            this.logger.debug(
              `executed ${model} upsert with ${result.numObjects} object(s) in ${result.durationMs}ms`
            );
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
    // sequentially flush upsert then write buffer
    // we do this sequentially because we may have updates
    // that operate on records in the upsert buffers and
    // therefore need the upserts written first
    await this.flushUpsertBuffer();
    await this.flushWriteBuffer();
  }

  private async flushWriteBuffer(): Promise<void> {
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

  private objectWithForeignKeys(upsert: Upsert): Dictionary<any> {
    if (isEmpty(upsert.foreignKeys)) {
      return upsert.object;
    }
    // for each FK, copy id of related upsert to FK field
    // the upsert's id was populated after the associated batch
    // was written in doFlushUpsertBuffer
    const result = clone(upsert.object);
    for (const [relName, fkUpsert] of Object.entries(upsert.foreignKeys)) {
      // foreign key was constructed from schema so the following is safe to access
      const fkField = this.schema.references[upsert.model][relName].foreignKey;
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
    return serialize(strictPick(obj, this.schema.primaryKeys[model]));
  }

  private toUpsertOp(model: string, modelUpserts: Upsert[]): UpsertOp {
    const upsertsByKey = new Map();
    // add FKs and index upsert by primary key
    // the index is needed after write to find source
    // upsert and set id
    const all = modelUpserts.map((u) => {
      const fullObj = this.objectWithForeignKeys(u);
      const key = this.serializedPrimaryKey(model, fullObj);
      const upsertsForKey = upsertsByKey.get(key);
      if (!upsertsForKey) {
        upsertsByKey.set(key, [u]);
      } else {
        upsertsForKey.push(u);
      }
      return fullObj;
    });
    const primaryKeys = this.schema.primaryKeys[model];
    // there can be multiple records that represent the
    // same object.  merge all records into one
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
