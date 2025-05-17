import {AirbyteLogger, readTestResourceAsJSON} from 'faros-airbyte-cdk';

import {GitLabToken, GitLab} from '../src/gitlab';
import {GitLabConfig} from '../src/types';

export function setupGitLabInstance(
  clientMock: any,
  logger: AirbyteLogger,
  config?: GitLabConfig
) {
  const gitlabConfig: GitLabConfig =
    config ?? readTestResourceAsJSON('config.json');
  const instance = new GitLabToken(
    gitlabConfig,
    {
      ...clientMock,
      Version: {
        show: jest.fn().mockImplementation(() => ({})),
      },
    },
    logger
  );
  GitLab.instance = jest.fn().mockImplementation(() => Promise.resolve(new GitLab(instance)));
}

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
