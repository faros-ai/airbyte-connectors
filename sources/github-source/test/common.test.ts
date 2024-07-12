import {calculateUpdatedStreamState} from 'faros-airbyte-cdk';

describe('calculateUpdatedStreamState', () => {
  test('should return currentStreamState if latestRecordCutoff is null', () => {
    const currentStreamState = {'github/repo1': {cutoff: 1627641720000}};
    const result = calculateUpdatedStreamState(
      null,
      currentStreamState,
      'github/repo1'
    );
    expect(result).toEqual(currentStreamState);
  });

  test('should return currentStreamState if latestRecordCutoff is not greater than currentCutoff', () => {
    const currentStreamState = {
      'github/repo1': {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
    };
    const latestRecordCutoff = new Date('2021-07-29T00:00:00Z');
    const result = calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      'github/repo1'
    );
    expect(result).toEqual(currentStreamState);
  });

  test('should return updated stream state if latestRecordCutoff is greater than currentCutoff', () => {
    const currentStreamState = {
      'github/repo1': {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
    };
    const latestRecordCutoff = new Date('2021-08-30T00:00:00Z');
    const result = calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      'github/repo1'
    );
    const expectedState = {
      'github/repo1': {cutoff: new Date('2021-08-30T00:00:00Z').getTime()},
    };
    expect(result).toEqual(expectedState);
  });
});
