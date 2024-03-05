import {
  CloudWatchClient,
  GetMetricDataCommand,
  GetMetricDataInput,
  GetMetricDataOutput,
  ListMetricsCommand,
  MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import {AirbyteLogger} from 'faros-airbyte-cdk';
import _ from 'lodash';
import {VError} from 'verror';

export const MIN_DATE = new Date(0).toISOString();
// January 1, 2200
export const MAX_DATE = new Date(7258118400000).toISOString();

const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;

export interface QueryGroup {
  name: string;
  queries: ReadonlyArray<any>;
}

export interface DataPoint {
  timestamp: string;
  value: number;
  label: string;
}

export interface Config {
  aws_region: string;
  credentials: {
    aws_access_key_id: string;
    aws_secret_access_key: string;
    aws_session_token?: string;
  };
  query_groups: ReadonlyArray<QueryGroup>;
  page_size?: number;
  cutoff_days?: number;
  stream_name?: string;
}

export class CloudWatch {
  private static cloudWatch: CloudWatch;

  constructor(
    private readonly client: CloudWatchClient,
    private readonly startDate: string,
    private readonly endDate: string,
    private readonly pageSize: number
  ) {}

  static instance(config: Config): CloudWatch {
    if (CloudWatch.cloudWatch) return CloudWatch.cloudWatch;

    if (!config.aws_region) {
      throw new VError('Please specify AWS region');
    }
    if (!config.credentials) {
      throw new VError('Please specify AWS credentials');
    }
    if (!config.credentials.aws_access_key_id) {
      throw new VError('Please specify AWS access key ID');
    }
    if (!config.credentials.aws_secret_access_key) {
      throw new VError('Please specify AWS secret access key');
    }

    if (config.query_groups.length === 0) {
      throw new Error('Please specify at least one query group');
    }

    for (const group of config.query_groups) {
      if (!group.name || !group.queries || group.queries.length === 0) {
        throw new Error(
          'Please specify a name and at least one query for each query group'
        );
      }

      for (const query of group.queries) {
        try {
          CloudWatch.toMetricDataQuery(query);
        } catch (e) {
          throw new VError(
            `Query group "${
              group.name
            }" contains invalid query: ${JSON.stringify(query)}`
          );
        }
      }
    }

    const cutoffDays = config.cutoff_days ?? DEFAULT_CUTOFF_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
    const startDate = cutoffDate.toISOString();
    const endDate = new Date().toISOString();

    const client = new CloudWatchClient({
      region: config.aws_region,
      credentials: {
        accessKeyId: config.credentials.aws_access_key_id,
        secretAccessKey: config.credentials.aws_secret_access_key,
        sessionToken: config.credentials.aws_session_token,
      },
    });

    CloudWatch.cloudWatch = new CloudWatch(
      client,
      startDate,
      endDate,
      config.page_size ?? DEFAULT_PAGE_SIZE
    );

    return CloudWatch.cloudWatch;
  }

  async checkConnection(): Promise<void> {
    await this.client.send(new ListMetricsCommand({}));
  }

  async *getMetricData(
    queries: ReadonlyArray<any>,
    after?: string,
    logger?: AirbyteLogger
  ): AsyncGenerator<DataPoint> {
    const params: GetMetricDataInput = {
      StartTime: new Date(after ?? this.startDate),
      EndTime: new Date(this.endDate),
      MaxDatapoints: this.pageSize,
      MetricDataQueries: queries.map(CloudWatch.toMetricDataQuery),
    };

    do {
      const command = new GetMetricDataCommand(params);
      const response: GetMetricDataOutput = await this.client.send(command);

      for (const result of response.MetricDataResults ?? []) {
        for (const [t, v] of _.zip(result.Timestamps, result.Values)) {
          if (t === undefined || v === undefined) continue;
          yield {
            timestamp: t.toISOString(),
            value: v,
            label: result.Label,
          };
        }
        logger?.info(`Fetched ${result.Timestamps?.length} data points`);
      }

      params.NextToken = response?.NextToken;
    } while (params.NextToken);
  }

  static toMetricDataQuery(query: any): MetricDataQuery | undefined {
    if (typeof query === 'object') {
      return query;
    }

    if (typeof query === 'string') {
      return JSON.parse(query);
    }

    return undefined;
  }

  static toQueryString(query: any): string | undefined {
    if (typeof query === 'string') {
      return query;
    }

    if (typeof query === 'object') {
      return JSON.stringify(query);
    }

    return undefined;
  }
}
