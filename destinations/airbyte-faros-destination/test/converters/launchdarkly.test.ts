import {AirbyteRecord} from 'faros-airbyte-cdk';
import {
  generateBasicTestSuite,
  initMockttp,
  tempConfig,
} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

import {Environments} from '../../src/converters/launchdarkly/environments';
import {Experiments} from '../../src/converters/launchdarkly/experiments';
import {FeatureFlags} from '../../src/converters/launchdarkly/feature_flags';
import {Projects} from '../../src/converters/launchdarkly/projects';
import {Users} from '../../src/converters/launchdarkly/users';

describe('launchdarkly', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  generateBasicTestSuite({sourceName: 'launchdarkly'});

  describe('projects', () => {
    const converter = new Projects();
    const PROJECT = {
      key: 'test-project',
      name: 'Test Project',
      tags: ['test', 'automated'],
    };

    test('basic project', async () => {
      const record = AirbyteRecord.make('projects', PROJECT);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('project without tags', async () => {
      const record = AirbyteRecord.make('projects', {
        key: 'simple-project',
        name: 'Simple Project',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('environments', () => {
    const converter = new Environments();
    const ENVIRONMENT = {
      key: 'production',
      name: 'Production',
      color: 'FF0000',
      tags: ['prod'],
    };

    test('basic environment', async () => {
      const record = AirbyteRecord.make('environments', ENVIRONMENT);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('environment without color and tags', async () => {
      const record = AirbyteRecord.make('environments', {
        key: 'staging',
        name: 'Staging',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('feature_flags', () => {
    const converter = new FeatureFlags();
    const FEATURE_FLAG = {
      key: 'test-flag',
      name: 'Test Flag',
      kind: 'boolean',
      description: 'A test feature flag',
      tags: ['test'],
    };

    test('basic feature flag', async () => {
      const record = AirbyteRecord.make('feature_flags', FEATURE_FLAG);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('multivariate feature flag', async () => {
      const record = AirbyteRecord.make('feature_flags', {
        key: 'multivariate-flag',
        name: 'Multivariate Flag',
        kind: 'multivariate',
        description: 'A multivariate feature flag',
        tags: ['test', 'multivariate'],
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('feature flag without description and tags', async () => {
      const record = AirbyteRecord.make('feature_flags', {
        key: 'simple-flag',
        name: 'Simple Flag',
        kind: 'boolean',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('users', () => {
    const converter = new Users();
    const USER = {
      key: 'user-123',
      name: 'John Doe',
      email: 'john@example.com',
      country: 'US',
    };

    test('basic user', async () => {
      const record = AirbyteRecord.make('users', USER);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('user with minimal data', async () => {
      const record = AirbyteRecord.make('users', {
        key: 'user-456',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('user without email and country', async () => {
      const record = AirbyteRecord.make('users', {
        key: 'user-789',
        name: 'Jane Smith',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });

  describe('experiments', () => {
    const converter = new Experiments();
    const EXPERIMENT = {
      key: 'test-experiment',
      name: 'Test Experiment',
      description: 'A test experiment',
      hypothesis: 'This will improve engagement',
    };

    test('basic experiment', async () => {
      const record = AirbyteRecord.make('experiments', EXPERIMENT);
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });

    test('experiment without description and hypothesis', async () => {
      const record = AirbyteRecord.make('experiments', {
        key: 'simple-experiment',
        name: 'Simple Experiment',
      });
      const res = await converter.convert(record);
      expect(res).toMatchSnapshot();
    });
  });
});
