import fs from 'fs-extra';
import {buildASTSchema, GraphQLSchema, parse, validate} from 'graphql';

import * as sut from '../src/queries';

describe('queries', () => {
  function loadGraphQLSchema(fileName: string): GraphQLSchema {
    const schema = fs.readFileSync(fileName, 'utf8');
    return buildASTSchema(parse(schema));
  }

  // Get the latest schemas here:
  // https://docs.github.com/en/graphql/overview/public-schema
  // and save them into schemas directory:
  const schemasDir = 'test/resources/graphql_schemas/';

  // Load all GitHub GraphQL schemas
  fs.readdirSync(schemasDir).forEach((file) => {
    const schema = loadGraphQLSchema(schemasDir + file);

    // Test all queries against all schemas
    Object.keys(sut).forEach((query) => {
      test(`${query} matches '${file}'`, async () => {
        const errors = validate(schema, parse(sut[query]));
        expect(errors).toHaveLength(0);
      });
    });
  });
});
