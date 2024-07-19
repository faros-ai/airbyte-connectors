import {createAppAuth} from '@octokit/auth-app';
import {paginateGraphql} from '@octokit/plugin-paginate-graphql';
import {retry} from '@octokit/plugin-retry';
import {throttling, ThrottlingOptions} from '@octokit/plugin-throttling';
import {Octokit} from '@octokit/rest';
import Bottleneck from 'bottleneck';
import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {getOperationAST, parse} from 'graphql';
import https from 'https';
import {uniq} from 'lodash';
import {Dictionary} from 'ts-essentials';
import url from 'url';
import template from 'url-template';
import VError from 'verror';

import {GitHubConfig} from './types';

export type RateLimitHandler = (reason?: Error) => boolean;

export type ExtendedOctokit = Octokit &
  ReturnType<typeof paginateGraphql> & {
    auditLogs: string;
  };
const ExtendedOctokitConstructor = Octokit.plugin(
  paginateGraphql,
  retry,
  throttling
);

export const GITHUB_API_URL = 'https://api.github.com';

const DEFAULT_CONCURRENCY = 4;

export function makeOctokitClient(
  cfg: GitHubConfig,
  installationId?: number,
  logger?: AirbyteLogger,
  onRateLimit?: RateLimitHandler,
  maxRetries = 3
): ExtendedOctokit {
  const throttle = getThrottle(cfg, logger, onRateLimit, maxRetries);
  const baseUrl = cfg.url ?? GITHUB_API_URL;
  // Check whether the protocol matches 'https:'
  const isHttps = new url.URL(baseUrl).protocol.startsWith('https');
  const request = isHttps
    ? {
        agent: new https.Agent({
          rejectUnauthorized: cfg.reject_unauthorized ?? true,
        }),
        timeout: 90_000,
      }
    : {timeout: 90_000};

  const auth = getOctokitAuth(cfg, installationId);

  const kit = new ExtendedOctokitConstructor({
    auth,
    authStrategy: cfg.authentication.type === 'app' ? createAppAuth : undefined,
    baseUrl,
    request,
    throttle,
  });

  kit.hook.before('request', (request) => {
    beforeRequestHook(cfg, request, logger);
  });

  kit.hook.after('request', (response) => {
    logger.debug(
      `Response: ${response.status} ${response.url} [remaining ${response.headers['x-ratelimit-resource']} rate-limit quota: ${response.headers['x-ratelimit-remaining']}]`
    );
  });

  return {
    ...kit,
    auditLogs: 'GET /orgs/{org}/audit-log',
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
  onRateLimit: (reason?: Error) => boolean,
  maxRetries: number
): ThrottlingOptions & {global: Bottleneck.Group} {
  return {
    global: new Bottleneck.Group({
      minTime: 100,
      maxConcurrent: cfg.concurrency_limit ?? DEFAULT_CONCURRENCY,
    }),
    onRateLimit: (after: number, opts: any): boolean | undefined => {
      const msg = `Quota exhausted for ${opts.method} ${opts.url}`;
      logger.warn(msg);
      return onRateLimit(new Error(msg));
    },
    onSecondaryRateLimit: (after: number, opts: any): boolean | undefined => {
      logger.warn(
        `Abuse detected for ${opts.method} ${opts.url}. Retry count: ${opts.request.retryCount}, after: ${after}`
      );
      if (opts.request.retryCount < maxRetries) {
        logger.info(`Retrying after ${after} seconds.`);
        return true;
      }
    },
  };
}

function beforeRequestHook(
  cfg: GitHubConfig,
  request: any,
  logger: AirbyteLogger
): void {
  // Allow setting media type for preview features
  // E.g https://docs.github.com/en/enterprise-server@3.1/rest/overview/api-previews
  if (cfg.previews?.length) {
    const mediaType = request.mediaType;
    request.mediaType = {
      ...mediaType,
      previews: uniq((mediaType?.previews ?? []).concat(cfg.previews)),
    };
  }
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
