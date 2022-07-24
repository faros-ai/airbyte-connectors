import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import {Reference, Schema, SchemaLoader} from 'faros-feeds-sdk';
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

export class GraphQLClient {
  private readonly logger = new AirbyteLogger();
  private readonly schemaLoader: SchemaLoader;
  private readonly backend: GraphQLBackend;
  private schema: Schema;
  private tableNames: Set<string>;

  constructor(schemaLoader: SchemaLoader, backend: GraphQLBackend) {
    this.schemaLoader = schemaLoader;
    this.backend = backend;
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

  // TODO: validate that these checks use proper camel cased names if applicable
  private backReferenceOriginCheck(br: Reference, origin: string): any {
    const base = {origin: {_neq: origin}};
    const backReferencesByModel = this.schema.backReferences[br.model] ?? [];
    const nestedChecks = backReferencesByModel
      .filter((nbr) => nbr.field != br.field)
      .map((nbr) => this.backReferenceOriginCheck(nbr, origin));
    return {
      [br.field]: {
        _or: [base].concat(nestedChecks),
      },
    };
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

  // TODO: add batching here
  private async postQuery(query: any, errorMsg: string): Promise<any> {
    const gql = jsonToGraphQLQuery(query);
    const res = await this.backend.postQuery(gql);
    if (res.errors) {
      throw new VError(
        `${errorMsg} with query '${gql}': ${JSON.stringify(res.errors)}`
      );
    }
    return res;
  }

  // TODO: implement batch flush
  async flush(): Promise<void> {
    return await Promise.resolve();
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
