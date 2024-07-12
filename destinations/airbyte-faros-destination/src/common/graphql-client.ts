import {randomUUID} from 'node:crypto';

import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {paginatedQueryV2, Schema, SchemaLoader} from 'faros-js-client';
import {EnumType, jsonToGraphQLQuery} from 'json-to-graphql-query';
import {
  clone,
  difference,
  flatMap,
  get,
  groupBy,
  has,
  intersection,
  isDate,
  isEmpty,
  isNil,
  isObject,
  isString,
  keys,
  max,
  orderBy,
  pick,
  reverse,
  set,
  unset,
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

const ROOT_FLAG = '__root__';

interface ConflictClause {
  constraint: EnumType;
  update_columns: EnumType[];
}

export interface GraphQLBackend {
  healthCheck(): Promise<void>;

  postQuery(query: any, variables?: any): Promise<any>;
}

interface WriteOp {
  readonly query: any;
  readonly errorMsg: string;
}

interface UpsertOp {
  readonly query: any;
  readonly upsertsByKey: Map<string, Upsert[]>;
  readonly isRoot: boolean;
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
    // the limiting factor is size of a single request
    return Array.from(this.upsertBuffer.values()).reduce(
      (acc, arr) => max([acc, arr.length]),
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

export function serialize(obj: Dictionary<any>): string {
  return keys(obj)
    .sort()
    .map((k) => `${k}:${serializeValue(obj[k])}`)
    .join('|');
}

export function serializeValue(obj: any): string {
  return isObject(obj) ? serialize(obj) : String(obj);
}

/**
 * Like lodash pick with (1) null value replacement and (2) type-aware normalization.
 */
export function strictPick(
  obj: any,
  keys: string[],
  keyTypes: Dictionary<string> = {},
  nullValue = 'null'
): any {
  function keyValue(key: string): any {
    let rawValue = obj[key];
    // normalize dates and string timestamps to epochs
    if (rawValue && keyTypes[key] === 'timestamptz') {
      rawValue = isDate(rawValue)
        ? rawValue.getTime()
        : isString(rawValue)
          ? Date.parse(rawValue)
          : rawValue;
    }
    return rawValue ?? nullValue;
  }
  return keys.reduce((result, key) => set(result, key, keyValue(key)), {});
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
 * Separates objects into arrays of objects
 * that all have the same keys.
 */
export function groupByKeys(objects: any[]): any[][] {
  const byObjKeyNames: Dictionary<any[]> = groupBy(objects, (obj) =>
    Object.keys(obj).sort().join('|')
  );
  return Object.values(byObjKeyNames);
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
function addLevel(u: Upsert): [Upsert, number][] {
  const result = [];
  let maxAncestorLevel = 0;
  for (const ancestor of Object.values(u.foreignKeys)) {
    if (ancestor.model === u.model) {
      const ancestorsWithLevels = addLevel(ancestor);
      maxAncestorLevel = max([ancestorsWithLevels[0][1], maxAncestorLevel]);
      result.push(...ancestorsWithLevels);
    }
  }
  const thisLevel = result.length ? maxAncestorLevel + 1 : 0;
  result.unshift([u, thisLevel]);
  return result;
}

export function toPostgresArrayLiteral(value: any[]): string {
  return `{${value
    .map((s) => {
      if (typeof s === 'string') {
        return `"${s}"`;
      }
      if (isNil(s)) {
        return 'NULL';
      }
      return s;
    })
    .join(',')}}`;
}

/**
 * Client for writing records as GraphQL mutations.  The client supports 3
 * kinds of writes: Upserts, Updates and Deletes.
 *
 * For upserts (when upsertBatchSize is greater than 0), the high-level algorithm is:
 *
 * > For each record, build a tree of Upserts. The tree has more than one node if the current record represents a
 *   nested entity (e.g. branch record referencing repo which, in-turn, references org).
 * > Buffer Upserts and index each by model (e.g. vcs_Branch)
 * > When batch size limit is reached, execute a single insert mutation per model. Start with leaves of Upsert tree.
 * > After inserting a batch, copy the id of each record back to the Upsert object. When inserting subsequent batches,
 *   required foreign keys will be read from the Upsert tree and copied to the appropriate batch mutation.
 *
 * Note: there is a complication in this algorithm for self-referent models (i.e. org_Employee's manager relationship).
 * For these models, we split the batch into "levels". The first level consists of records with no dependencies on
 * records of the same type. The second depends on the first and so on.
 *
 * For Updates and Deletes (which are much less frequent) we have a separate write buffer.  This buffer is
 * flushed if it reaches capacity.  There is no attempt to combine these into bulk mutations (as done w/ upserts).
 */
export class GraphQLClient {
  private readonly logger: AirbyteLogger;
  private readonly schemaLoader: SchemaLoader;
  private readonly backend: GraphQLBackend;
  private schema: Schema;
  private tableNames: Set<string>;
  private tableDependencies: string[];
  private supportsSetCtx = false;
  private readonly mutationBatchSize: number;
  private readonly upsertBatchSize: number;
  private readonly writeBuffer: WriteOp[] = [];
  private readonly upsertBuffer = new UpsertBuffer();
  private readonly selfReferentModels = new Set();
  private readonly updateResetLimit: boolean;
  private readonly resetPageSize: number;
  private resetLimitMillis: number;

  constructor(
    logger: AirbyteLogger,
    schemaLoader: SchemaLoader,
    backend: GraphQLBackend,
    upsertBatchSize,
    mutationBatchSize,
    updateResetLimit = true,
    resetPageSize = 500
  ) {
    this.logger = logger;
    this.schemaLoader = schemaLoader;
    this.backend = backend;
    this.upsertBatchSize = upsertBatchSize ?? 10000;
    this.mutationBatchSize = mutationBatchSize ?? 100;
    this.resetPageSize = resetPageSize;
    assert(
      this.upsertBatchSize >= 0,
      `negative upsert batch size: ${this.upsertBatchSize}`
    );
    assert(
      this.mutationBatchSize > 0,
      `non-positive mutation batch size: ${this.mutationBatchSize}`
    );
    assert(
      this.resetPageSize > 0,
      `non-positive reset page size: ${this.resetPageSize}`
    );
    this.updateResetLimit = updateResetLimit;
    this.resetLimitMillis = updateResetLimit
      ? // January 1, 2200
        7258118400000
      : Date.now();
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
    // check if we have setCtx mutation available based on presence of its result table
    this.supportsSetCtx = this.tableNames.has('set_ctx_result');
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
    models: ReadonlyArray<string>,
    keepReferencedRecords: boolean
  ): Promise<void> {
    this.checkSchema();

    // ensure deletes are executed after processing records
    await this.flush();

    const minRefreshedAt = new Date(this.resetLimitMillis).toISOString();
    const deleteSessionId = randomUUID().toString();
    const sessionInfo = this.supportsSetCtx
      ? ` with session id ${deleteSessionId}`
      : '';
    this.logger.info(
      `Resetting data before ${minRefreshedAt} for origin ${origin}${sessionInfo}`
    );

    for (const model of intersection(
      this.schema.sortedModelDependencies,
      models
    )) {
      this.logger.info(`Resetting ${model} data for origin ${origin}`);
      const deleteConditions = {
        origin: {_eq: origin},
        refreshedAt: {_lt: minRefreshedAt},
      };
      if (keepReferencedRecords) {
        deleteConditions['_not'] = {
          _or: this.schema.backReferences[model].map((br) => {
            return {
              [br.field]: {},
            };
          }),
        };
      }
      const query = {
        [model]: {
          __args: {
            where: {
              _and: {...deleteConditions},
            },
          },
          id: true,
        },
      };
      const records = paginateQuery(
        jsonToGraphQLQuery({query}),
        (query, args) =>
          this.backend.postQuery(query, args).then((res) => res?.data),
        this.resetPageSize
      );
      let ids = [];
      for await (const record of records) {
        ids.push(record.id);
        // delete in batches
        if (ids.length >= this.resetPageSize) {
          await this.deleteById(model, ids, deleteSessionId);
          ids = [];
        }
      }
      // clean up any remaining records
      if (ids.length > 0) {
        await this.deleteById(model, ids, deleteSessionId);
      }
    }
  }

  async deleteById(
    model: string,
    ids: string[],
    session: string
  ): Promise<void> {
    const query = `mutation {
      ${this.supportsSetCtx ? `ctx: setCtx(args: {session: "${session}"}) { success }` : ''}
      del: delete_${model}(where:{id: {_in:[
        ${ids.map((id) => `"${id}"`).join(',')}
      ]}}) {
        affected_rows
      }
    }`;
    await this.backend.postQuery(query);
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
    if (this.upsertBatchSize) {
      this.addUpsert(model, record, origin);
      if (this.upsertBuffer.size() >= this.upsertBatchSize) {
        await this.flushUpsertBuffer();
      }
    } else {
      const obj = this.createMutationObject(model, record, origin);
      const mutation = {
        [`insert_${model}_one`]: {__args: obj, id: true, refreshedAt: true},
      };
      await this.postQuery({mutation}, `Failed to write ${model} record`);
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

      if (this.updateResetLimit && op.isRoot) {
        const recordRefreshedAtMs = new Date(obj.refreshedAt).getTime();
        this.resetLimitMillis = Math.min(
          recordRefreshedAtMs,
          this.resetLimitMillis
        );
      }
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
        const iterator: AsyncIterable<UpsertResult[]> = batchIterator(
          withLevels,
          (batch) => {
            const ops = this.toUpsertOps(model, batch);
            return Promise.all(ops.map((op) => this.execUpsert(model, op)));
          }
        );
        try {
          for await (const results of iterator) {
            for (const result of results) {
              this.logger.debug(
                `Executed ${model} upsert with ${result.numObjects} object(s) in ${result.durationMs}ms`
              );
            }
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
    const upsertRec = {
      ...record.where,
      ...pick(record.patch, record.mask),
    };
    const obj = this.createMutationObject(
      record.model,
      upsertRec,
      record.origin,
      true
    );
    const mutation = {
      [`insert_${record.model}_one`]: {__args: obj, id: true},
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
        // res.data is expected to have one object with 'id' and 'refreshedAt' for each of the mutations
        // {
        //   "m0": {
        //     "id": ...,
        //     "refreshedAt": ...
        //   },
        //   "m1": {
        //     "id": ...,
        //     "refreshedAt": ...
        //   },
        //   ...
        // }
        if (this.updateResetLimit) {
          for (const mutationRes of Object.values(res.data)) {
            const refreshedAt = get(mutationRes, 'refreshedAt');
            if (refreshedAt) {
              const recordRefreshedAtMs = new Date(refreshedAt).getTime();
              this.resetLimitMillis = Math.min(
                recordRefreshedAtMs,
                this.resetLimitMillis
              );
            }
          }
        }

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
    record: Dictionary<any>,
    origin?: string,
    keepExistingOrigin?: boolean,
    nested?: boolean
  ): {
    data?: Dictionary<any>;
    object?: Dictionary<any>;
    on_conflict: Dictionary<any>;
  } {
    const obj = {};
    const foreignKeys = [];
    for (const [field, value] of Object.entries(record)) {
      const nestedModel = this.schema.references[model][field];
      if (nestedModel && value) {
        foreignKeys.push(nestedModel.foreignKey);
        obj[nestedModel.field] = this.createMutationObject(
          nestedModel.model,
          value,
          undefined,
          keepExistingOrigin,
          true
        );
      } else {
        const val = this.formatFieldValue(model, field, value);
        if (!isNil(val)) obj[field] = val;
      }
    }
    if (origin) {
      obj['origin'] = origin;
    }
    const updateFieldMask = new Set(Object.keys(obj).concat(foreignKeys));
    if (keepExistingOrigin) {
      updateFieldMask.delete('origin');
    }
    return {
      [nested ? 'data' : 'object']: obj,
      on_conflict: this.createConflictClause(model, nested, updateFieldMask),
    };
  }

  private addUpsert(
    model: string,
    record: Dictionary<any>,
    origin?: string
  ): Upsert {
    const object = {};
    const foreignKeys: Dictionary<Upsert> = {};
    for (const [field, value] of Object.entries(record)) {
      const nestedModel = this.schema.references[model][field];
      if (nestedModel) {
        if (isNil(value)) {
          // for explicit nil relation, set the FK of this record to null
          object[nestedModel.foreignKey] = null;
        } else {
          foreignKeys[field] = this.addUpsert(nestedModel.model, value);
        }
      } else if (this.isValidField(model, field)) {
        const val = this.formatFieldValue(model, field, value);
        object[field] = isNil(val) ? null : val;
      }
    }
    if (origin) {
      object['origin'] = origin;
      // add root flag to top-level objects
      object[ROOT_FLAG] = true;
    }
    // since all our uids are non-null, check for nil uids early
    // to prevent losing an entire batch later with db constraint
    // error on flush
    if (has(object, 'uid') && isNil(object['uid'])) {
      throw new VError(
        'cannot upsert null or undefined uid for model %s with keys %s',
        model,
        JSON.stringify(pick(record, this.schema.primaryKeys[model]))
      );
    }
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
    const keyObj = strictPick(
      obj,
      this.schema.primaryKeys[model],
      this.schema.scalars[model]
    );
    return serialize(keyObj);
  }

  private toUpsertOps(model: string, modelUpserts: Upsert[]): UpsertOp[] {
    // shared among all the results of this method
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
    const allObjects = mergeByPrimaryKey(all, primaryKeys);
    const keysObj = primaryKeys
      .sort()
      .reduce((a, v) => ({...a, [v]: true}), {});
    // for each set of unique keys, build an UpsertOp
    const groups = groupByKeys(allObjects);
    return groups.map((objects) => {
      assert(objects?.length, 'objects should not be empty');
      // all objects have same fields due to groupByKeys call
      // pull out fields of first as mask for update fields to ensure
      // fields that aren't in the data are not modified by the upsert
      const updateColumnMask = new Set(Object.keys(objects[0]));
      // determine if this group contains root objects
      let isRoot = false;
      if (has(objects[0], ROOT_FLAG)) {
        isRoot = true;
        // remove root flag from all objects
        objects.forEach((o) => delete o[ROOT_FLAG]);
      }
      const onConflict = this.createUpsertConflictClause(
        model,
        updateColumnMask,
        isRoot
      );
      const mutation = {
        mutation: {
          [`insert_${model}`]: {
            __args: {
              // sort objects to avoid deadlocks on concurrent inserts
              objects: orderBy(objects, primaryKeys),
              on_conflict: onConflict,
            },
            returning: {
              id: true,
              refreshedAt: true,
              ...keysObj,
            },
          },
        },
      };
      return {
        query: mutation,
        upsertsByKey,
        isRoot,
      };
    });
  }

  private isValidField(model: string, field: string): boolean {
    return has(this.schema.scalars[model], field);
  }

  private formatFieldValue(model: string, field: string, value: any): any {
    if (isNil(value)) return undefined;
    if (!this.isValidField(model, field)) {
      this.logger.debug(`Could not find type of ${field} in ${model}`);
      return undefined;
    }
    const type = this.schema.scalars[model][field];
    if (type === 'timestamptz') {
      // The field value may already be a string. E.g., if coming from the Faros Feeds source.
      return typeof value === 'string' ? value : timestamptz(value);
    } else if (type.startsWith('_') && typeof value !== 'string') {
      if (!Array.isArray(value)) {
        throw new Error(
          `expected array for ${model}.${field} of type ${type}. Received: ${JSON.stringify(
            value
          )}`
        );
      }
      // format array value as postgres literal
      return toPostgresArrayLiteral(value);
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
    nested?: boolean,
    updateFieldMask?: Set<string>
  ): ConflictClause {
    const updateColumns = nested
      ? []
      : difference(
          Object.keys(this.schema.scalars[model]),
          this.schema.primaryKeys[model]
        );
    const filteredUpdateFields =
      updateFieldMask && !nested
        ? updateColumns.filter((c) => updateFieldMask.has(c))
        : updateColumns;
    // if empty, use model keys to ensure queries always return results
    if (isEmpty(filteredUpdateFields)) {
      filteredUpdateFields.push(...this.schema.primaryKeys[model]);
    }
    return {
      constraint: new EnumType(`${model}_pkey`),
      update_columns: filteredUpdateFields.map((c) => new EnumType(c)),
    };
  }

  private createUpsertConflictClause(
    model: string,
    updateFieldMask: Set<string>,
    isRoot: boolean
  ): ConflictClause {
    // superset of fields that can be updated
    const updateColumns = difference(
      Object.keys(this.schema.scalars[model]),
      this.schema.primaryKeys[model]
    );
    // filter to only those fields that are in the data
    const filteredUpdateFields = updateColumns.filter((c) =>
      updateFieldMask.has(c)
    );
    // for root objects, always update refreshedAt
    if (isRoot) {
      filteredUpdateFields.push('refreshedAt');
    }
    // if empty, use model keys to ensure queries always return results
    if (isEmpty(filteredUpdateFields)) {
      filteredUpdateFields.push(...this.schema.primaryKeys[model]);
    }
    return {
      constraint: new EnumType(`${model}_pkey`),
      update_columns: filteredUpdateFields.map((c) => new EnumType(c)),
    };
  }
}

function timestamptz(date: Date): string {
  return dateformat.asString(dateformat.ISO8601_WITH_TZ_OFFSET_FORMAT, date);
}

function paginateQuery(
  rawQuery: string,
  client: (query: string, args: any) => Promise<any>,
  pageSize = 1000,
  args: Map<string, any> = new Map<string, any>()
): AsyncIterable<any> {
  const {query, edgesPath, edgeIdPath} = paginatedQueryV2(rawQuery);
  assert(edgesPath && edgeIdPath);
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<any> {
      let id = '';
      let hasNextPage = true;
      while (hasNextPage) {
        const data = await client(query, {
          limit: pageSize,
          id,
          ...Object.fromEntries(args.entries()),
        });
        const edges = get(data, edgesPath) || [];
        for (const edge of edges) {
          id = get(edge, edgeIdPath);
          unset(edge, edgeIdPath);
          if (!id) {
            return;
          }
          yield edge;
        }
        // break on partial page
        hasNextPage = edges.length === pageSize;
      }
    },
  };
}
