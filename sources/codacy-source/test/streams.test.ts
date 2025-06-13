import {
  AirbyteSourceLogger,
} from 'faros-airbyte-cdk';

import {Issues} from '../src/streams/issues';
import {Metrics} from '../src/streams/metrics';
import {Repositories} from '../src/streams/repositories';

function sourceLogger(): AirbyteSourceLogger {
  return new AirbyteSourceLogger();
}

const config = {
  api_token: 'test-token',
  organization: 'test-org',
};

describe('streams', () => {
  test('repositories - primary key', async () => {
    const stream = new Repositories(config, sourceLogger());
    expect(stream.primaryKey).toBe('id');
  });

  test('repositories - cursor field', async () => {
    const stream = new Repositories(config, sourceLogger());
    expect(stream.cursorField).toBe('updatedAt');
  });

  test('issues - primary key', async () => {
    const stream = new Issues(config, sourceLogger());
    expect(stream.primaryKey).toBe('id');
  });

  test('issues - cursor field', async () => {
    const stream = new Issues(config, sourceLogger());
    expect(stream.cursorField).toBe('updatedAt');
  });

  test('metrics - primary key', async () => {
    const stream = new Metrics(config, sourceLogger());
    expect(stream.primaryKey).toStrictEqual(['repositoryId', 'commitSha']);
  });

  test('metrics - cursor field', async () => {
    const stream = new Metrics(config, sourceLogger());
    expect(stream.cursorField).toBe('createdAt');
  });
});
