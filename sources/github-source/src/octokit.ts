import {createAppAuth} from '@octokit/auth-app';
import {retry} from '@octokit/plugin-retry';
import {throttling} from '@octokit/plugin-throttling';
import {Octokit} from '@octokit/rest';
import Bottleneck from 'bottleneck';
import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {getOperationAST, parse} from 'graphql';
import https from 'https';
import {uniq} from 'lodash';
import {Dictionary} from 'ts-essentials';
import url from 'url';
import template from 'url-template';

import {GithubConfig} from './types';

export type RateLimitHandler = (reason?: Error) => boolean;

const FeedOctokit = Octokit.plugin(retry, throttling);

export const GITHUB_API_URL = 'https://api.github.com';

export function makeOctokitClient(
  cfg: GithubConfig,
  logger?: AirbyteLogger,
  onRateLimit?: RateLimitHandler,
  maxRetries = 3
): Octokit {
  const throttle = getThrottle(cfg, logger, onRateLimit, maxRetries);
  const baseUrl = cfg.api_url ?? GITHUB_API_URL;
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

  let auth: string | Dictionary<any>;
  if (cfg.authentication.auth === 'token') {
    auth = cfg.authentication.personal_access_token;
  } else if (cfg.authentication.app_cfg.auth === 'client') {
    auth = {
      type: cfg.authentication.auth,
      appId: cfg.authentication.app_id,
      privateKey: cfg.authentication.private_key,
      clientId: cfg.authentication.app_cfg.client_id,
      clientSecret: cfg.authentication.app_cfg.client_secret,
    };
  } else {
    auth = {
      type: cfg.authentication.auth,
      appId: cfg.authentication.app_id,
      privateKey: cfg.authentication.private_key,
      installationId: cfg.authentication.app_cfg.installation_id,
    };
  }

  const kit = new FeedOctokit({
    auth,
    authStrategy: cfg.authentication.auth === 'app' ? createAppAuth : undefined,
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

  return kit;
}

function getThrottle(
  cfg: GithubConfig,
  logger: AirbyteLogger,
  onRateLimit: (reason?: Error) => boolean,
  maxRetries: number
): Dictionary<any> {
  return {
    global: new Bottleneck.Group({
      minTime: 100,
      maxConcurrent: cfg.concurrency_limit,
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
  cfg: GithubConfig,
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
