import {JqlBuilder} from '../src/jql-builder';

describe('JqlBuilder', () => {
  test('builds JQL with project', () => {
    const jql = new JqlBuilder().withProject('PROJECT-1').build();
    expect(jql).toBe('project = "PROJECT-1"');
  });

  test('builds JQL with date range', () => {
    const startDate = new Date('2022-01-01');
    const endDate = new Date('2022-01-31');
    const jql = new JqlBuilder().withDateRange([startDate, endDate]).build();
    expect(jql).toBe(
      `updated >= ${startDate.getTime()} AND updated < ${endDate.getTime()}`
    );
  });

  test('throws error for invalid date range', () => {
    const startDate = new Date('2022-01-31');
    const endDate = new Date('2022-01-01');
    expect(() =>
      new JqlBuilder().withDateRange([startDate, endDate]).build()
    ).toThrow();
  });

  test('builds JQL with multiple clauses', () => {
    const jql = new JqlBuilder('issueType = "Bug"')
      .withProject('PROJECT-123')
      .withDateRange([new Date('2022-01-01'), new Date('2022-01-31')])
      .build();
    expect(jql).toMatchSnapshot();
  });
});
