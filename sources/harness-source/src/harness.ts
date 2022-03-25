import {AirbyteLogger} from 'faros-airbyte-cdk';
import {ClientError, GraphQLClient} from 'graphql-request';
import {VError} from 'verror';

import {
  ExecutionNode,
  HarnessConfig,
  RequestOptionsExecutions,
  RequestResultExecutions,
} from './harness_models';
import {getQueryExecution, getQueryToCheckConnection} from './resources';

export const DEFAULT_CUTOFF_DAYS = 90;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_HARNESS_API_URL = 'https://app.harness.io';

/** These 4 params need to attach environments and services to each execution.
  Then find a valid one in each lists */
const APP_ENV_LIMIT = 10;
const APP_ENV_OFFSET = 0;
const APP_SERVICE_LIMIT = 10;
const APP_SERVICE_OFFSET = 0;

export class Harness {
  private static harness: Harness = null;

  constructor(
    readonly client: GraphQLClient,
    readonly pageSize: number,
    readonly logger: AirbyteLogger
  ) {}

  static instance(config: HarnessConfig, logger: AirbyteLogger): Harness {
    if (Harness.harness) return Harness.harness;

    if (!config.account_id) {
      throw new VError(
        "Missing authentication information. Please provide a Harness user's accountId"
      );
    }
    if (!config.api_key) {
      throw new VError(
        'Missing authentication information. Please provide a Harness apiKey'
      );
    }

    const apiUrl = config.api_url || DEFAULT_HARNESS_API_URL;
    const pageSize = config.page_size || DEFAULT_PAGE_SIZE;
    const client = new GraphQLClient(
      `${apiUrl}/gateway/api/graphql?accountId=${config.account_id}`,
      {headers: {'x-api-key': config.api_key}}
    );

    Harness.harness = new Harness(client, pageSize, logger);
    logger.debug('Created Harness instance');

    return Harness.harness;
  }

  wrapGraphError(err: ClientError): string {
    let message = '';
    err?.response?.errors?.forEach((e) => {
      message += e.message;
    });
    return message ? message : err.message ?? '';
  }

  async checkConnection(): Promise<void> {
    try {
      await this.client.request(getQueryToCheckConnection());
    } catch (err: any) {
      throw new VError(
        `Please verify your API ID or key are correct. Error: ${this.wrapGraphError(
          err
        )}`
      );
    }
  }

  private async *getIteratorExecution(
    func: (
      options: RequestOptionsExecutions
    ) => Promise<RequestResultExecutions>,
    options: RequestOptionsExecutions,
    since: number,
    logger: AirbyteLogger
  ): AsyncGenerator<ExecutionNode> {
    let offset = 0;
    let hasMore = true;
    do {
      try {
        const {executions} = await func({...options, offset});
        for (const item of executions.nodes || []) {
          const endedAt = item.endedAt;
          const startedAt = item.startedAt;

          // We get deployments sorted by desc order. Harness API however returns
          // deployments without ended times
          if (!endedAt && startedAt && since >= startedAt) {
            logger.info(
              `Skipping deployment: ${item.application.id} with no finished time but has started time: ${item.startedAt}, which is before current cutoff: ${since}`
            );
            continue;
          }
          if (endedAt && since >= endedAt) {
            logger.info(
              `Skipping execution ${item.id}, ended ${item.endedAt} before cutoff ${since}`
            );
            return null;
          }

          yield item;
        }
        offset += executions.pageInfo.limit ?? executions.nodes.length;
        hasMore = executions.pageInfo.hasMore;
      } catch (ex: any) {
        logger.error(ex);
        throw ex;
      }
    } while (hasMore);
  }

  getExecutions(since?: number): AsyncGenerator<ExecutionNode> {
    const query = getQueryExecution(since);

    const func = (
      options: RequestOptionsExecutions
    ): Promise<RequestResultExecutions> => {
      const result = this.client.request(query, options);
      return result as Promise<RequestResultExecutions>;
    };

    const funcOptions: RequestOptionsExecutions = {
      appEnvLimit: APP_ENV_LIMIT,
      appEnvOffset: APP_ENV_OFFSET,
      appServiceLimit: APP_SERVICE_LIMIT,
      appServiceOffset: APP_SERVICE_OFFSET,
      offset: 0,
      limit: this.pageSize,
      endedAt: since,
    };

    return this.getIteratorExecution(func, funcOptions, since, this.logger);
  }
}
