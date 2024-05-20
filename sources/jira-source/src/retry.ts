import {AirbyteLogger, wrapApiError} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import jira from 'jira.js';
import _ from 'lodash';

/** Mixin/Trait to add retry logic to jira.js clients
 * See: https://www.typescriptlang.org/docs/handbook/mixins.html
 */
type Retryable = new (...args: any[]) => {
  sendRequest<T>(
    requestConfig: jira.RequestConfig,
    callback: jira.Callback<T> | never
  ): Promise<T>;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function WithRetry<T extends Retryable>(
  Base: T,
  maxAttempts: number,
  logger?: AirbyteLogger
) {
  return class Retry extends Base {
    readonly _maxAttempts: number;
    readonly _stats: {[key: string]: number} = {totalCalls: 0};
    readonly _logger?: AirbyteLogger;

    constructor(...args: any[]) {
      super(...args);
      this._maxAttempts = maxAttempts;
      this._logger = logger;
    }

    // https://developer.atlassian.com/cloud/jira/platform/rate-limiting/#rate-limit-responses
    static getDelay(attempt: number, response: any): number {
      const headers = response?.headers ?? {};
      const attemptDelay = 3000 * attempt;
      let responseDelay = 0;
      if (_.isNumber(headers['Retry-After'])) {
        responseDelay = 1000 * headers['Retry-After'];
      } else if (_.isString(headers['X-RateLimit-Reset'])) {
        const reset = new Date(headers['X-RateLimit-Reset']);
        if (!isNaN(reset.getTime())) {
          const delayUntilReset = reset.getTime() - Date.now();
          if (delayUntilReset > 0) {
            responseDelay = delayUntilReset;
          }
        }
      }
      // Override delay if one is present in the response
      // and is larger than the delay for this attempt
      const jitter = _.random(0, 5000);
      return Math.max(attemptDelay, responseDelay) + jitter;
    }

    static _isRetryable(err: any): boolean {
      const status = err?.status;
      const errorCode = err.code;
      return (
        status === 429 ||
        status >= 500 ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNABORTED' ||
        errorCode === 'ECONNRESET'
      );
    }

    async _retry(op: () => Promise<any>): Promise<any> {
      let attempt = 1;
      let lastErr: Error;
      while (attempt <= this._maxAttempts) {
        try {
          return await op();
        } catch (err: any) {
          lastErr = err;
          if (!Retry._isRetryable(err)) {
            break;
          }
          const delay = Retry.getDelay(attempt, err?.cause?.response);
          logger?.warn(
            `Retry attempt ${attempt} of ${this._maxAttempts}. Retrying in ${delay} milliseconds`
          );
          await Utils.sleep(delay);
          attempt++;
        }
      }
      throw wrapApiError(lastErr);
    }

    async sendRequest<T>(
      requestConfig: jira.RequestConfig,
      callback: jira.Callback<T> | never
    ): Promise<T> {
      this._stats.totalCalls++;
      if (this._stats[requestConfig.url]) {
        this._stats[requestConfig.url]++;
      } else {
        this._stats[requestConfig.url] = 1;
      }

      return this._maxAttempts > 1
        ? await this._retry(() => super.sendRequest(requestConfig, callback))
        : await super.sendRequest(requestConfig, callback);
    }

    getStats(): {[key: string]: number} {
      return this._stats;
    }
  };
}

type WithRetryMixin<T extends Retryable> = InstanceType<
  ReturnType<typeof WithRetry<T>>
>;
export type Version2ClientWithRetry = WithRetryMixin<
  typeof jira.Version2Client
>;
export type AgileClientWithRetry = WithRetryMixin<typeof jira.AgileClient>;
export type BaseClientWithRetry = WithRetryMixin<typeof jira.BaseClient>;
