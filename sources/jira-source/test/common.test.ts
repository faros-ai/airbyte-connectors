import {StreamBase} from '../src/streams/common';

describe('calculateUpdatedStreamState', () => {
  test('should return currentStreamState if latestRecordCutoff is null', () => {
    const currentStreamState = {project1: {cutoff: 1627641720000}};
    const result = StreamBase.calculateUpdatedStreamState(
      null,
      currentStreamState,
      'project1',
      0
    );
    expect(result).toEqual(currentStreamState);
  });

  test('should return currentStreamState if adjustedLatestRecordCutoff is not greater than currentCutoff', () => {
    const currentStreamState = {
      project1: {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
    };
    const latestRecordCutoff = new Date('2021-08-01T00:00:00Z');
    const result = StreamBase.calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      'project1',
      7
    );
    expect(result).toEqual(currentStreamState);
  });

  test('should return updated stream state if adjustedLatestRecordCutoff is greater than currentCutoff', () => {
    const currentStreamState = {
      project1: {cutoff: new Date('2021-07-30T00:00:00Z').getTime()},
    };
    const latestRecordCutoff = new Date('2021-08-30T00:00:00Z');
    const result = StreamBase.calculateUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      'project1',
      7
    );
    const expectedState = {
      project1: {cutoff: new Date('2021-08-23T00:00:00Z').getTime()},
    };
    expect(result).toEqual(expectedState);
  });
});
