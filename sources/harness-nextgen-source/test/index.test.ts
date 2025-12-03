import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
} from 'faros-airbyte-cdk';

import {HarnessNextgenSource} from '../src';

describe('HarnessNextgenSource', () => {
  const logger = new AirbyteSourceLogger(AirbyteLogLevel.DEBUG);
  const source = new HarnessNextgenSource(logger);

  test('spec', async () => {
    const spec = await source.spec();
    expect(spec).toBeInstanceOf(AirbyteSpec);
    const specJson = spec.spec;
    expect(specJson.connectionSpecification).toBeDefined();
    expect(specJson.connectionSpecification.properties).toBeDefined();
    expect(specJson.connectionSpecification.properties.api_key).toBeDefined();
    expect(specJson.connectionSpecification.properties.account_id).toBeDefined();
    expect(specJson.connectionSpecification.properties.cutoff_days).toBeDefined();
  });

  test('type', () => {
    expect(source.type).toBe('harness-nextgen');
  });

  test('streams', () => {
    const config = {
      api_key: 'test-key',
      account_id: 'test-account',
      cutoff_days: 90,
    };
    const streams = source.streams(config);
    expect(streams).toHaveLength(6);
    const streamNames = streams.map((s) => s.name);
    expect(streamNames).toContain('organizations');
    expect(streamNames).toContain('projects');
    expect(streamNames).toContain('pipelines');
    expect(streamNames).toContain('services');
    expect(streamNames).toContain('environments');
    expect(streamNames).toContain('executions');
  });
});
