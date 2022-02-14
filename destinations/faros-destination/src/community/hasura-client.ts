import axios, {AxiosInstance} from 'axios';
import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {EnumType, jsonToGraphQLQuery} from 'json-to-graphql-query';
import {difference, find} from 'lodash';
import path from 'path';
import toposort from 'toposort';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

import {
  DeletionRecord,
  Operation,
  TimestampedRecord,
  UpdateRecord,
  UpsertRecord,
} from './types';

interface Table {
  schema: string;
  name: string;
}

interface ObjectRelationship {
  name: string;
  using: {
    foreign_key_constraint_on: string;
  };
}

interface ArrayRelationship {
  name: string;
  using: {
    foreign_key_constraint_on: {
      column: string;
      table: Table;
    };
  };
}

interface TableWithRelationships {
  table: Table;
  object_relationships: ReadonlyArray<ObjectRelationship>;
  array_relationships: ReadonlyArray<ArrayRelationship>;
}

interface Source {
  name: string;
  kind: string;
  tables: ReadonlyArray<TableWithRelationships>;
  configuration: any;
}

interface Reference {
  field: string;
  model: string;
}

interface ConflictClause {
  constraint: EnumType;
  update_columns: EnumType[];
}

export class HasuraClient {
  private readonly api: AxiosInstance;
  private readonly logger = new AirbyteLogger();
  private readonly primaryKeys: Dictionary<string[]> = {};
  private readonly scalars: Dictionary<Dictionary<string>> = {};
  private readonly references: Dictionary<Dictionary<Reference>> = {};
  private readonly backReferences: Dictionary<Reference[]> = {};

  constructor(url: string) {
    this.api = axios.create({
      baseURL: url,
      headers: {'X-Hasura-Role': 'admin'},
    });
  }

  async healthCheck(): Promise<void> {
    try {
      await this.api.get('/healthz');
    } catch (e) {
      throw new VError(e, 'Failed to check Hasura health');
    }
  }

  private async fetchDbSource(): Promise<Source> {
    const response = await this.api.post('/v1/metadata', {
      type: 'export_metadata',
      version: 2,
      args: {},
    });
    const sources: Source[] = response.data.metadata.sources;
    const defaultSource = find(sources, (source) => source.name === 'default');
    if (!defaultSource) {
      throw new VError('Faros database not connected to Hasura');
    }
    return defaultSource;
  }

  async loadSchema(): Promise<any> {
    await this.fetchPrimaryKeys();
    const source = await this.fetchDbSource();
    const query = await fs.readFile(
      path.join(__dirname, '../../resources/introspection-query.gql'),
      'utf8'
    );
    const response = await this.api.post('/v1/graphql', {query});
    const schema = response.data.data.__schema;
    for (const table of source.tables) {
      const tableName = table.table.name;
      const type = find(
        schema.types,
        (t) => t.name === tableName && t.kind === 'OBJECT'
      );
      if (!type) continue;
      const scalarTypes: any[] = type.fields.filter(
        (t) =>
          t.type.kind === 'SCALAR' ||
          (t.type.kind === 'NON_NULL' && t.type.ofType.kind === 'SCALAR')
      );
      const scalars: Dictionary<string> = {};
      for (const scalar of scalarTypes) {
        scalars[scalar.name] = scalar.type.ofType?.name ?? scalar.type.name;
      }
      this.scalars[tableName] = scalars;
      const references: Dictionary<Reference> = {};
      for (const rel of table.object_relationships ?? []) {
        const [refType] = rel.name.split('__');
        references[rel.using.foreign_key_constraint_on] = {
          field: rel.name,
          model: refType,
        };
      }
      this.references[tableName] = references;
      this.backReferences[tableName] = (table.array_relationships ?? []).map(
        (rel) => {
          return {
            field: rel.name,
            model: rel.using.foreign_key_constraint_on.table.name,
          };
        }
      );
    }
  }

  private async fetchPrimaryKeys(): Promise<void> {
    const response = await this.api.post('/v2/query', {
      type: 'run_sql',
      args: {
        source: 'default',
        sql: await fs.readFile(
          path.join(__dirname, '../../resources/fetch-primary-keys.sql'),
          'utf8'
        ),
        cascade: false,
        read_only: true,
      },
    });
    const result: [string, string][] = response.data.result;
    result
      .filter((row) => row[0] !== 'table_name')
      .forEach(([table, exp]) => {
        // TODO: better way to do this?
        const columns = exp
          .replace('pkey(VARIADIC ARRAY[', '')
          .replace('])', '')
          .split(', ')
          .map((col) => col.replace(/"/g, ''));
        this.primaryKeys[table] = columns;
      });
  }

  private backReferenceOriginCheck(br: Reference, origin: string): any {
    const base = {origin: {_neq: origin}};
    const nestedChecks = this.backReferences[br.model]
      .filter((nbr) => nbr.field != br.field)
      .map((nbr) => this.backReferenceOriginCheck(nbr, origin));
    return {
      [br.field]: {
        _or: [base].concat(nestedChecks),
      },
    };
  }

  async resetData(origin: string): Promise<void> {
    const modelDeps: [string, string][] = [];
    for (const model of Object.keys(this.references)) {
      for (const ref of Object.values(this.references[model])) {
        if (model !== ref.model) {
          modelDeps.push([model, ref.model]);
        }
      }
    }
    for (const model of toposort(modelDeps)) {
      this.logger.info(`Resetting ${model} data for origin ${origin}`);
      const deleteConditions = {
        origin: {_eq: origin},
        _not: {
          _or: this.backReferences[model].map((br) =>
            this.backReferenceOriginCheck(br, origin)
          ),
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

  // TODO: find alternate batching strategy
  // cannot use Hasura batching due to https://github.com/hasura/graphql-engine/issues/4633
  async writeRecord(
    model: string,
    origin: string,
    record: Dictionary<any>
  ): Promise<void> {
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
          record.origin,
          (record as UpsertRecord).data
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

  private async postQuery(query: any, errorMsg: string): Promise<any> {
    const response = await this.api.post('/v1/graphql', {
      query: jsonToGraphQLQuery(query),
    });
    if (response.data.errors) {
      throw new VError(`${errorMsg}: ${JSON.stringify(response.data.errors)}`);
    }
    return response.data;
  }

  private createWhereClause(
    model: string,
    record: Dictionary<any>
  ): Dictionary<any> {
    const obj = {};
    for (const [field, value] of Object.entries(record)) {
      const nestedModel = this.references[model][field];
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
      const nestedModel = this.references[model][field];
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
    const type = this.scalars[model][field];
    if (!type) {
      this.logger.debug(`Could not find type of ${field} in ${model}`);
      return undefined;
    }
    return type === 'timestamptz' ? timestamptz(value) : value;
  }

  private createConflictClause(
    model: string,
    nested?: boolean
  ): ConflictClause {
    const updateColumns = nested
      ? ['refreshedAt']
      : difference(
          Object.keys(this.scalars[model]),
          this.primaryKeys[model].concat('id')
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
