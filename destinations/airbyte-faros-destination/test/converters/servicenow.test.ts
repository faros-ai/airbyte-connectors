import {generateBasicTestSuite} from 'faros-airbyte-testing-tools';

import {Incidents} from '../../src/converters/servicenow/incidents';

generateBasicTestSuite({sourceName: 'servicenow'});

describe('incident/application association', () => {
  const incAppImpact = {
    incident: {uid: 'incident123', source: 'source1'},
    application: {name: 'app1', platform: 'platform1'},
  };

  const incAppImpacts = {
    incident123: new Set<string>(['app1_platform1']),
  };

  test('should return false if incident source does not match', () => {
    const result = Incidents.shouldDeleteRecord(
      incAppImpact,
      'differentSource',
      incAppImpacts
    );

    expect(result).toBe(false);
  });

  test('should return false if incident was not processed', () => {
    const result = Incidents.shouldDeleteRecord(
      {incident: {uid: 'unprocessed', source: 'source1'}},
      'source1',
      incAppImpacts
    );

    expect(result).toBe(false);
  });

  test('keeps new incident/application association', () => {
    const result = Incidents.shouldDeleteRecord(
      incAppImpact,
      'source1',
      incAppImpacts
    );

    expect(result).toBe(false);
  });

  test('deletes old associations of processed incidents', () => {
    const result = Incidents.shouldDeleteRecord(
      {
        incident: {uid: 'incident123', source: 'source1'},
        application: {name: 'app0', platform: 'platform0'},
      },
      'source1',
      incAppImpacts
    );

    expect(result).toBe(true);
  });
});
