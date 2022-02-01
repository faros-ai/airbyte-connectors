import axios, {AxiosInstance} from 'axios';
import fs from 'fs-extra';
import {DocumentNode, Kind, parse, print} from 'graphql';
import {difference, find} from 'lodash';
import path from 'path';
import pino, {Logger} from 'pino';
import {Dictionary} from 'ts-essentials';
import {VError} from 'verror';

interface Scalar {
  name: string;
  type: string;
}

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

export class HasuraClient {
  private readonly api: AxiosInstance;
  private readonly logger: Logger = pino({name: 'hasura-client'});
  private readonly primaryKeyDefs: Dictionary<string[]> = {};
  private readonly scalars: Dictionary<Scalar[]> = {};
  private readonly references: Dictionary<Dictionary<string>> = {};
  private source: Source = undefined;

  constructor(url: string, private readonly batch_size: number) {
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

  async fetchDbSource(): Promise<Source> {
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
    this.source = defaultSource;
    return defaultSource;
  }

  async introspect(): Promise<any> {
    await this.fetchPrimaryKeyDefs();
    console.log(this.primaryKeyDefs);
    const source = await this.fetchDbSource();
    const query = await fs.readFile(
      path.join(__dirname, '../../resources/instrospection-query.gql'),
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
      const scalars: Scalar[] = scalarTypes.map((t) => {
        return {
          name: t.name,
          type: t.type.ofType?.name ?? t.type.name,
        };
      });
      this.scalars[tableName] = scalars;
      const references: Dictionary<string> = {};
      for (const rel of table.object_relationships ?? []) {
        references[rel.using.foreign_key_constraint_on] = rel.name;
      }
      this.references[tableName] = references;
    }
  }

  async writeRecord(model: string, record: any): Promise<void> {
    for (const field in record) {
      this.formatFieldValue(model, field, record[field]);
    }
  }

  formatFieldValue(model: string, field: string, value: any): void {
    if (this.references[model][field]) {
      console.log(`Found ${model} ${field} ${this.references[model][field]}`);
    }
  }

  private createConflictConf(
    model: string,
    record: Dictionary<any>
  ): Dictionary<any> {
    const cols = difference(
      Object.keys(record),
      this.primaryKeyDefs[model]
    ).concat(['refreshedAt']);
    return {
      constraint: `${model}_pkey`,
      update_columns: difference(
        Object.keys(record),
        this.primaryKeyDefs[model]
      ).concat(['refreshedAt']),
    };
  }

  async fetchPrimaryKeyDefs(): Promise<void> {
    const response = await this.api.post('/v2/query', {
      type: 'run_sql',
      args: {
        source: 'default',
        sql: await fs.readFile(
          path.join(__dirname, '../../resources/primary-key-defs.sql'),
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
        const columns = exp
          .replace('pkey(VARIADIC ARRAY[', '')
          .replace('])', '')
          .split(', ')
          .map((col) => col.replace('"', ''));
        this.primaryKeyDefs[table] = columns;
      });
  }

  async parseMutation(): Promise<any> {
    const file = await fs.readFile(
      path.join(__dirname, '../../resources/mutation.gql'),
      'utf8'
    );
    const doc = parse(file);
    console.log(JSON.stringify(doc.definitions, null, 2));
    const newDoc: DocumentNode = {kind: Kind.DOCUMENT, definitions: []};
    console.log(print(newDoc));
  }
}
