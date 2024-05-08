import VError from 'verror';

export class JqlBuilder {
  private jql: string[] = [];

  constructor(jql?: string) {
    this.jql = jql ? [jql] : [];
  }

  withProject(projectId: string): JqlBuilder {
    this.jql.push(`project = "${projectId}"`);
    return this;
  }

  withDateRange(range?: [Date, Date]): JqlBuilder {
    if (!range) {
      return this;
    }
    this.jql.push(JqlBuilder.updatedBetweenJql(range));
    return this;
  }

  build(): string {
    return this.jql.join(' AND ');
  }

  private static updatedBetweenJql(range: [Date, Date]): string {
    const [from, to] = range;
    if (to < from) {
      throw new VError(
        `invalid update range: end timestamp '${to}' ` +
          `is strictly less than start timestamp '${from}'`
      );
    }
    return `updated >= ${from.getTime()} AND updated < ${to.getTime()}`;
  }
}
