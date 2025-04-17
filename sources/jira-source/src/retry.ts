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
    callback: jira.Callback<T>
  ): Promise<T>;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function WithRetry<T extends Retryable>(
  Base: T,
  isCloud: boolean,
  maxAttempts: number,
  delay: number = 5000,
  logger?: AirbyteLogger
) {
  return class Retry extends Base {
    static readonly _isCloud: boolean = isCloud;
    static readonly _delay: number = delay;
    readonly _maxAttempts: number;
    readonly _stats: {[key: string]: number} = {totalCalls: 0};
    readonly _logger?: AirbyteLogger;

    constructor(...args: any[]) {
      super(...args);
      this._maxAttempts = maxAttempts;
      this._logger = logger;
    }

    // Jira Cloud: https://developer.atlassian.com/cloud/jira/platform/rate-limiting/#rate-limit-responses
    // Jira Server: https://confluence.atlassian.com/adminjiraserver0904/adjusting-your-code-for-rate-limiting-1188768983.html
    static getDelay(attempt: number, response: any): number {
      const headers = response?.headers ?? {};
      const attemptDelay = this._delay * attempt;
      let responseDelay = 0;
      const retryAfter = _.toNumber(
        headers['retry-after'] ?? headers['Retry-After']
      );

      // Only found in Jira Cloud
      const rateLimitReset =
        headers['x-ratelimit-reset'] ?? headers['X-RateLimit-Reset'];

      // Only found in Jira Server
      const rateLimitIntervalSeconds = _.toNumber(
        headers['x-ratelimit-interval-seconds'] ??
          headers['X-RateLimit-Interval-Seconds']
      );

      if (_.isFinite(retryAfter)) {
        responseDelay = 1000 * retryAfter;
      } else if (_.isString(rateLimitReset)) {
        const reset = new Date(rateLimitReset);
        if (!isNaN(reset.getTime())) {
          const delayUntilReset = reset.getTime() - Date.now();
          if (delayUntilReset > 0) {
            responseDelay = delayUntilReset;
          }
        }
      } else if (_.isFinite(rateLimitIntervalSeconds)) {
        responseDelay = 1000 * rateLimitIntervalSeconds;
      }
      // Override delay if one is present in the response
      // and is larger than the delay for this attempt
      const jitter = _.random(0, 500);
      return Math.max(attemptDelay, responseDelay) + jitter;
    }

    static _isRetryable(err: any): boolean {
      const status = err?.status;
      const errorCode = err.code;
      return (
        this._isServerIntermittent4xx(err) ||
        status === 429 ||
        status >= 500 ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNABORTED' ||
        errorCode === 'ECONNRESET' ||
        errorCode === 'ECONNREFUSED'
      );
    }

    // Jira Server may intermittently return 4xx HTTP codes for expired sessions
    // 400 or 401 errors on search endpoints and 404 for get project endpoints
    // https://confluence.atlassian.com/jirakb/how-to-handle-http-400-bad-request-errors-on-jira-search-rest-api-endpoint-1223819764.html
    static _isServerIntermittent4xx(err: any): boolean {
      const status = err?.status;
      const isIntermittentStatus = [400, 401, 404].includes(status);
      if (this._isCloud || !isIntermittentStatus) {
        return false;
      }
      const response = err?.cause?.response;
      const headers = response?.headers ?? {};
      const userName = _.toLower(
        headers['x-ausername'] ?? headers['X-Ausername']
      );
      return userName === 'anonymous';
    }

    async _retry(op: () => Promise<any>): Promise<any> {
      let attempt = 1;
      let lastErr: Error;
      while (attempt <= this._maxAttempts) {
        try {
          return await op();
        } catch (err: any) {
          lastErr = err;

          // Based of https://www.npmjs.com/package/jira.js#error-handling
          if (!Retry._isRetryable(err)) {
            break;
          }

          const errorCode = err?.status ?? err.code;

          const delay = Retry.getDelay(attempt, err?.cause?.response);
          logger?.warn(
            `Request failed with status code ${errorCode}. ` +
              `Retry attempt ${attempt} of ${this._maxAttempts}. ` +
              `Retrying in ${delay} milliseconds`
          );
          await Utils.sleep(delay);
          attempt++;
        }
      }
      throw wrapApiError(lastErr);
    }

    async sendRequest<T>(
      requestConfig: jira.RequestConfig,
      callback: jira.Callback<T>
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
