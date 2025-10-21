import {createAppAuth} from '@octokit/auth-app';
import {Octokit as OctokitCore} from '@octokit/core';
import {paginateGraphql} from '@octokit/plugin-paginate-graphql';
import {retry} from '@octokit/plugin-retry';
import {throttling, ThrottlingOptions} from '@octokit/plugin-throttling';
import {RequestError} from '@octokit/request-error';
import {Octokit as OctokitRest} from '@octokit/rest';
import {
  EndpointDefaults,
  OctokitResponse,
  RequestRequestOptions,
} from '@octokit/types';
import Bottleneck from 'bottleneck';
import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {getOperationAST, parse} from 'graphql';
import https from 'https';
import {Dictionary} from 'ts-essentials';
import {
  fetch as undiciFetch,
  ProxyAgent,
  RequestInfo,
  RequestInit,
} from 'undici';
import url from 'url';
import template from 'url-template';
import VError from 'verror';

import {
  DEFAULT_CONCURRENCY,
  DEFAULT_GITHUB_API_URL,
  DEFAULT_REJECT_UNAUTHORIZED,
  DEFAULT_TIMEOUT_MS,
} from './github';
import {GitHubConfig} from './types';

export type ExtendedOctokit = OctokitRest &
  ReturnType<typeof paginateGraphql> & {
    auditLogs: string;
    copilotMetrics: string;
    copilotMetricsForTeam: string;
    enterpriseCopilotSeats: string;
    enterpriseCopilotMetrics: string;
    enterpriseCopilotMetricsForTeam: string;
    enterpriseCopilotUserEngagement: string;
    enterpriseCopilotUserUsage: string;
    enterpriseTeams: string;
    enterpriseTeamMembers: string;
  };
const ExtendedOctokitConstructor = OctokitRest.plugin(
  paginateGraphql,
  timeout,
  retryAdditionalConditions,
  retry,
  throttling
);

export function makeOctokitClient(
  cfg: GitHubConfig,
  installationId?: number,
  logger?: AirbyteLogger,
  maxRetries = 3
): ExtendedOctokit {
  const throttle = getThrottle(cfg, logger, maxRetries);
  const baseUrl = cfg.url ?? DEFAULT_GITHUB_API_URL;
  // Check whether the protocol matches 'https:'
  const isHttps = new url.URL(baseUrl).protocol.startsWith('https');
  const request: RequestRequestOptions = {
    ...(isHttps && {
      agent: new https.Agent({
        rejectUnauthorized:
          cfg.reject_unauthorized ?? DEFAULT_REJECT_UNAUTHORIZED,
      }),
    }),
    ...(cfg.proxy_url && {
      fetch: (url: RequestInfo, opts: RequestInit) => {
        return undiciFetch(url, {
          ...opts,
          dispatcher: new ProxyAgent({
            uri: cfg.proxy_url,
          }),
        });
      },
    }),
  };

  const auth = getOctokitAuth(cfg, installationId);
  const logFn = (message: string, additionalInfo?: object) =>
    logger.debug(
      message,
      additionalInfo ? JSON.stringify(additionalInfo) : undefined
    );
  const kit = new ExtendedOctokitConstructor({
    auth,
    authStrategy: cfg.authentication.type === 'app' ? createAppAuth : undefined,
    baseUrl,
    request,
    throttle,
    timeout: {
      ms: cfg.timeout ?? DEFAULT_TIMEOUT_MS,
    },
    log: {
      info: logFn,
      warn: logFn,
      error: logFn,
      debug: logFn,
    },
  });

  kit.hook.before('request', (request) => {
    beforeRequestHook(request, logger);
  });

  kit.hook.after('request', (response) => {
    logger.debug(
      `Response: ${response.status} ${response.url} [remaining ${response.headers['x-ratelimit-resource']} rate-limit quota: ${response.headers['x-ratelimit-remaining']}]`
    );
  });

  return {
    ...kit,
    auditLogs: 'GET /orgs/{org}/audit-log',
    copilotMetrics: 'GET /orgs/{org}/copilot/metrics',
    copilotMetricsForTeam: 'GET /orgs/{org}/team/{team_slug}/copilot/metrics',
    enterpriseCopilotSeats:
      'GET /enterprises/{enterprise}/copilot/billing/seats',
    enterpriseCopilotMetrics: 'GET /enterprises/{enterprise}/copilot/metrics',
    enterpriseCopilotMetricsForTeam:
      'GET /enterprises/{enterprise}/team/{team_slug}/copilot/metrics',
    enterpriseCopilotUserEngagement:
      'GET /enterprises/{enterprise}/copilot/user-engagement',
    enterpriseCopilotUserUsage:
      'GET /enterprises/{enterprise}/copilot/metrics/reports/users-28-day/latest',
    enterpriseTeams: 'GET /enterprises/{enterprise}/teams',
    enterpriseTeamMembers:
      'GET /enterprises/{enterprise}/teams/{team_slug}/memberships',
  };
}

function getOctokitAuth(
  cfg: GitHubConfig,
  installationId?: number
): string | Dictionary<any> {
  if (cfg.authentication?.type === 'token') {
    if (!cfg.authentication.personal_access_token) {
      throw new VError(
        'Invalid token configuration: personal_access_token is required'
      );
    }
    return cfg.authentication.personal_access_token;
  }

  if (cfg.authentication?.type === 'app') {
    if (!cfg.authentication.app_id || !cfg.authentication.private_key) {
      throw new VError(
        'Invalid app configuration: app_id and private_key are required'
      );
    }

    return {
      appId: cfg.authentication.app_id,
      privateKey: cfg.authentication.private_key,
      ...(installationId && {installationId}),
    };
  }

  throw new VError(
    'Invalid authentication configuration: type should be "token" or "app"'
  );
}

function getThrottle(
  cfg: GitHubConfig,
  logger: AirbyteLogger,
  maxRetries: number
): ThrottlingOptions & {global: Bottleneck.Group} {
  return {
    global: new Bottleneck.Group({
      minTime: 100,
      maxConcurrent: cfg.concurrency_limit ?? DEFAULT_CONCURRENCY,
    }),
    onRateLimit: rateLimitHandler('RateLimit', logger, maxRetries),
    onSecondaryRateLimit: rateLimitHandler(
      'SecondaryRateLimit',
      logger,
      maxRetries
    ),
  };
}

function rateLimitHandler(
  event: string,
  logger: AirbyteLogger,
  maxRetries: number
) {
  return (
    after: number,
    opts: Required<EndpointDefaults>
  ): boolean | undefined => {
    logger.warn(
      `${event} detected for ${opts.method} ${opts.url}. Retry count: ${opts.request.retryCount}, after: ${after}`
    );
    if (opts.request.retryCount < maxRetries) {
      logger.info(`Retrying after ${after} seconds.`);
      return true;
    }
  };
}

function beforeRequestHook(
  request: Required<EndpointDefaults>,
  logger: AirbyteLogger
): void {
  if (logger.level === AirbyteLogLevel.DEBUG) {
    let url = request.url;
    if (url.includes('{')) {
      const urlTemplate = template.parse(url);
      url = urlTemplate.expand(request);
    }
    if (url.startsWith('/')) {
      url = request.baseUrl + url;
    }

    let query = '';
    if (request?.query && url.endsWith('/graphql')) {
      const queryStr = String(request.query);
      const node = parse(queryStr);
      const operation = getOperationAST(node);
      const vars = request?.variables ?? {};
      query = `[${operation.name.value}: ${JSON.stringify(vars)}]`;
    }

    logger.debug(`Request : ${request.method} ${url} ${query}`);
  }
}

// Fake HTTP status code used by manually thrown errors to trigger retries by the retry-plugin
const RETRYABLE_STATUS_CODE = 1000;

function timeout(octokit: OctokitCore, octokitOptions: any) {
  const timeoutMs = octokitOptions.timeout?.ms;
  if (timeoutMs > 0) {
    octokit.hook.wrap('request', async (request, options) => {
      const controller = new AbortController();
      options.request.signal = controller.signal;
      let timeoutId: NodeJS.Timeout;
      const timeout = new Promise(() => {
        timeoutId = setTimeout(() => {
          controller.abort(); // aborts request after timeout
        }, timeoutMs);
      });
      try {
        return (await Promise.race([
          request(options),
          timeout,
        ])) as OctokitResponse<any, number>;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw retryableError(
            `GitHub request timed-out after ${timeoutMs} ms`,
            options
          );
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }
  return {};
}

function retryAdditionalConditions(octokit: OctokitCore) {
  octokit.hook.wrap('request', async (request, options) => {
    const response = await request(options);
    if (options.url.endsWith('/graphql')) {
      // sometimes graphql returns 200 with no data instead of 5xx after server timeout
      if (!response.data) {
        throw retryableError(
          'GitHub GraphQL returned response with no data',
          options
        );
      }
    }
    return response;
  });

  octokit.hook.error('request', async (error, options) => {
    const retryAdditionalError = options.request.retryAdditionalError;
    if (!retryAdditionalError?.(error)) {
      throw error;
    }
    throw retryableError(error.message, options);
  });

  return {};
}

function retryableError(
  message: string,
  options: Required<EndpointDefaults>
): RequestError {
  // simulate request error so that retry plugin retries the request
  return new RequestError(message, RETRYABLE_STATUS_CODE, {
    request: options,
  });
}
