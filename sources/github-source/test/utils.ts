import {AirbyteLogger, readTestResourceAsJSON} from 'faros-airbyte-cdk';

import {
  DEFAULT_BUCKET_ID,
  DEFAULT_BUCKET_TOTAL,
  DEFAULT_FETCH_PR_FILES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_TIMEOUT_MS,
  GitHub,
  GitHubToken,
} from '../src/github';
import {GitHubConfig} from '../src/types';

export function setupGitHubInstance(
  octokitMock: any,
  logger: AirbyteLogger,
  config?: GitHubConfig
) {
  const githubConfig: GitHubConfig =
    config ?? readTestResourceAsJSON('config.json');
  GitHub.instance = jest.fn().mockImplementation(() => {
    return new GitHubToken(
      {
        ...octokitMock,
        paginate: {
          iterator: (fnOrErr?: (() => any) | Error) => {
            if (!fnOrErr) {
              throw new Error('Not mocked');
            }
            if (fnOrErr instanceof Error) {
              return iterate(fnOrErr);
            }
            return iterate([{data: fnOrErr()}]);
          },
        },
        orgs: {
          ...octokitMock.orgs,
          listForAuthenticatedUser:
            octokitMock.orgs?.listForAuthenticatedUser ??
            jest.fn().mockReturnValue([{login: 'github'}]),
        },
        auditLogs:
          octokitMock.auditLogs ??
          new ErrorWithStatus(400, 'API not available'),
      },
      githubConfig.bucket_id ?? DEFAULT_BUCKET_ID,
      githubConfig.bucket_total ?? DEFAULT_BUCKET_TOTAL,
      githubConfig.fetch_pull_request_files ?? DEFAULT_FETCH_PR_FILES,
      githubConfig.page_size ?? DEFAULT_PAGE_SIZE,
      githubConfig.timeout ?? DEFAULT_TIMEOUT_MS,
      logger
    );
  });
}

export const graphqlMockedImplementation = (queryName: string, res: any) => {
  const graphqlMock: any = jest.fn().mockImplementation((query: string) => {
    if (!query.includes(`query ${queryName}`)) {
      throw new Error('Not mocked');
    }
    return res;
  });

  graphqlMock.paginate = {
    iterator: jest.fn().mockImplementation((query: string) => {
      if (!query.includes(`query ${queryName}`)) {
        throw new Error('Not mocked');
      }
      return iterate([res]);
    }),
  };

  return {
    graphql: graphqlMock,
  };
};

export async function* iterate<T>(
  arrOrErr: ReadonlyArray<T> | Error
): AsyncIterableIterator<T> {
  if (arrOrErr instanceof Error) {
    throw arrOrErr;
  }
  for (const x of arrOrErr) {
    yield x;
  }
}

class ErrorWithStatus extends Error {
  constructor(
    readonly status: number,
    readonly message: string
  ) {
    super(message);
  }
}
