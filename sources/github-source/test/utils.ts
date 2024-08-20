import {AirbyteLogger, readTestResourceAsJSON} from 'faros-airbyte-cdk';

import {GitHub, GitHubToken} from '../src/github';
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
      githubConfig,
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
      },
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

export class ErrorWithStatus extends Error {
  constructor(
    readonly status: number,
    readonly message: string
  ) {
    super(message);
  }
}
