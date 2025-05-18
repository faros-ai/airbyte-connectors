import {AirbyteLogger} from 'faros-airbyte-cdk';

import {GitLab} from '../src/gitlab';
import {GitLabConfig} from '../src/types';

export class ErrorWithStatus extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function setupGitLabInstance(
  mockedImplementation: Record<string, jest.Mock>,
  logger: AirbyteLogger,
  config?: GitLabConfig
): void {
  const mockGitLab = {
    checkConnection: jest.fn(),
    getGroupsIterator: jest.fn(),
    getGroup: jest.fn(),
    ...mockedImplementation,
  };

  jest.spyOn(GitLab, 'instance').mockImplementation(async () => {
    return mockGitLab as unknown as GitLab;
  });
}
