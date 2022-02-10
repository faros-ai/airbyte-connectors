import axios, {AxiosInstance} from 'axios';
import dateformat from 'date-format';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {EnumType, jsonToGraphQLQuery} from 'json-to-graphql-query';
import {difference, find, sortBy} from 'lodash';
import path from 'path';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

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

interface TableWithRelationships {
  table: Table;
  object_relationships: ReadonlyArray<ObjectRelationship>;
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

enum Operation {
  UPSERT = 'Upsert',
  UPDATE = 'Update',
  DELETION = 'Deletion',
}

interface TimestampedRecord {
  model: string;
  at: number;
  operation: Operation;
}

interface UpsertRecord extends TimestampedRecord {
  operation: Operation.UPSERT;
  data: Dictionary<any>;
}

interface UpdateRecord extends TimestampedRecord {
  operation: Operation.UPDATE;
  where: Dictionary<any>;
  mask: string[];
  patch: Dictionary<any>;
}

interface DeletionRecord extends TimestampedRecord {
  operation: Operation.DELETION;
  where: Dictionary<any>;
}

function isUpsertRecord(record: TimestampedRecord): record is UpsertRecord {
  return record.operation === Operation.UPSERT;
}
function isUpdateRecord(record: TimestampedRecord): record is UpdateRecord {
  return record.operation === Operation.UPDATE;
}
function isDeletionRecord(record: TimestampedRecord): record is DeletionRecord {
  return record.operation === Operation.DELETION;
}

export class HasuraClient {
  private readonly api: AxiosInstance;
  private readonly logger = new AirbyteLogger();
  private readonly primaryKeys: Dictionary<string[]> = {};
  private readonly scalars: Dictionary<Dictionary<string>> = {};
  private readonly references: Dictionary<Dictionary<Reference>> = {};
  private readonly timestampedRecords: TimestampedRecord[] = [];

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
        const [refType, _] = rel.name.split('__');
        references[rel.using.foreign_key_constraint_on] = {
          field: rel.name,
          model: refType,
        };
      }
      this.references[tableName] = references;
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

  // TODO: find alternate batching strategy
  // cannot use Hasura batching due to https://github.com/hasura/graphql-engine/issues/4633
  async writeRecord(model: string, record: Dictionary<any>): Promise<void> {
    const [baseModel, operation] = model.split('__', 2);
    if (!operation) {
      await this.writeStandardRecord(model, record);
    } else if (operation === 'Upsert' && record.at === 0) {
      await this.writeStandardRecord(baseModel, record.data);
    } else if (Object.values(Operation).includes(operation as Operation)) {
      this.timestampedRecords.push({
        model: baseModel,
        operation,
        ...record,
      } as TimestampedRecord);
    } else {
      throw new VError(
        `Unuspported model operation ${operation} for ${model}: ${record}`
      );
    }
  }

  async writeTimestampedRecords(): Promise<void> {
    const sortedRecords = sortBy(this.timestampedRecords, (r) => r.at);
    for (const record of sortedRecords) {
      if (isUpsertRecord(record)) {
        await this.writeStandardRecord(record.model, record.data);
      } else if (isUpdateRecord(record)) {
        await this.writeUpdateRecord(record);
      } else if (isDeletionRecord(record)) {
        await this.writeDeletionRecord(record);
      } else {
        throw new VError(
          `Unuspported model operation ${record.operation} for ${record}`
        );
      }
    }
  }

  private async writeStandardRecord(
    model: string,
    record: Dictionary<any>
  ): Promise<void> {
    const obj = this.createMutationObject(model, record);
    const mutation = {
      mutation: {
        [`insert_${model}_one`]: {__args: obj, id: true},
      },
    };
    const response = await this.api.post('/v1/graphql', {
      query: jsonToGraphQLQuery(mutation),
    });
    if (response.data.errors) {
      throw new VError(
        `Failed to write ${model} record ${JSON.stringify(
          record
        )}: ${JSON.stringify(response.data.errors)}`
      );
    }
  }

  private async writeUpdateRecord(record: UpdateRecord): Promise<void> {
    const mutation = {
      mutation: {
        [`update_${record.model}`]: {
          __args: {
            where: this.createWhereClause(record.model, record.where),
            _set: this.createMutationObject(record.model, record.patch).object,
          },
          returning: {
            id: true,
          },
        },
      },
    };
    const response = await this.api.post('/v1/graphql', {
      query: jsonToGraphQLQuery(mutation),
    });
    if (response.data.errors) {
      throw new VError(
        `Failed to update ${record.model} record ${JSON.stringify(
          record
        )}: ${JSON.stringify(response.data.errors)}`
      );
    }
  }

  private async writeDeletionRecord(record: DeletionRecord): Promise<void> {
    const mutation = {
      mutation: {
        [`delete_${record.model}`]: {
          __args: {
            where: this.createWhereClause(record.model, record.where),
          },
          affected_rows: true,
        },
      },
    };
    const response = await this.api.post('/v1/graphql', {
      query: jsonToGraphQLQuery(mutation),
    });
    if (response.data.errors) {
      throw new VError(
        `Failed to delete ${record.model} record ${JSON.stringify(
          record
        )}: ${JSON.stringify(response.data.errors)}`
      );
    }
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
          value,
          true
        );
      } else {
        const val = this.formatFieldValue(model, field, value);
        if (val) obj[field] = val;
      }
    }
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
    const cols = nested
      ? ['refreshedAt']
      : difference(
          Object.keys(this.scalars[model]),
          this.primaryKeys[model].concat('id')
        );
    return {
      constraint: new EnumType(`${model}_pkey`),
      update_columns: cols.map((c) => new EnumType(c)),
    };
  }
}

function timestamptz(date: Date): string {
  return dateformat.asString(dateformat.ISO8601_WITH_TZ_OFFSET_FORMAT, date);
}
