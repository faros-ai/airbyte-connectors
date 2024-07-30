import fs from 'fs-extra';
import {buildASTSchema, GraphQLSchema, parse, validate} from 'graphql';

import * as sut from '../../src/github/queries';
import {
  FILES_FRAGMENT,
  LABELS_FRAGMENT,
  REVIEW_REQUESTS_FRAGMENT,
  REVIEWS_FRAGMENT,
} from '../../src/github/queries';

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
          queryStr +=
            LABELS_FRAGMENT +
            '\n' +
            FILES_FRAGMENT +
            '\n' +
            REVIEWS_FRAGMENT +
            '\n' +
            REVIEW_REQUESTS_FRAGMENT;
        }
        const errors = validate(schema, parse(queryStr));
        expect(errors).toHaveLength(0);
      });
    });
  });
});
