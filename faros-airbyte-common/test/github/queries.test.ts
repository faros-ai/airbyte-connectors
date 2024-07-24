import fs from 'fs-extra';
import {buildASTSchema, GraphQLSchema, parse, validate} from 'graphql';

import {REVIEWS_FRAGMENT} from '../../lib/github/queries';
import * as sut from '../../src/github/queries';
import {FILES_FRAGMENT} from '../../src/github/queries';

describe('queries', () => {
  function loadGraphQLSchema(fileName: string): GraphQLSchema {
    const schema = fs.readFileSync(fileName, 'utf8');
    return buildASTSchema(parse(schema));
  }

  // Get the latest schemas here:
  // https://docs.github.com/en/graphql/overview/public-schema
  // and save them into schemas directory:
  const schemasDir = 'resources/github/schemas/';

  // Load all GitHub GraphQL schemas
  fs.readdirSync(schemasDir).forEach((file) => {
    const schema = loadGraphQLSchema(schemasDir + file);

    // Test all queries against all schemas
    Object.keys(sut).forEach((query) => {
      let queryStr = sut[query];
      if (queryStr.includes('fragment')) return;

      test(`${query} matches '${file}'`, async () => {
        if (query === 'PULL_REQUESTS_QUERY') {
          queryStr += FILES_FRAGMENT + '\n' + REVIEWS_FRAGMENT;
        }
        const errors = validate(schema, parse(queryStr));
        expect(errors).toHaveLength(0);
      });
    });
  });
});
