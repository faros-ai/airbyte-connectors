import VError from 'verror';

export class JqlBuilder {
  private jql?: string;
  private projectId?: string;
  private range?: [Date, Date];

  constructor(jql?: string) {
    this.jql = jql;
  }

  withProject(projectId: string): JqlBuilder {
    this.projectId = projectId;
    return this;
  }

  withDateRange(range?: [Date, Date]): JqlBuilder {
    this.range = range;
    return this;
  }

  build(): string {
    const parts = [];
    if (this.projectId) {
      parts.push(`project = "${this.projectId}"`);
    }
    if (this.jql) {
      parts.push(this.jql);
    }
    if (this.range) {
      parts.push(JqlBuilder.updatedBetweenJql(this.range));
    }
    return parts.join(' AND ');
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
