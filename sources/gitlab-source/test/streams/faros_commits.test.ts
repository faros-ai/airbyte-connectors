import {AirbyteLogger, SyncMode} from 'faros-airbyte-cdk';
import {Commit} from 'faros-airbyte-common/gitlab';

import {GitLab} from '../../src/gitlab';
import {GroupFilter} from '../../src/group-filter';
import {FarosCommits} from '../../src/streams/faros_commits';

describe('FarosCommits', () => {
  const logger = new AirbyteLogger();
  const config = {
    authentication: {
      type: 'token' as const,
      personal_access_token: 'test-token',
    },
    url: 'https://gitlab.example.com',
    groups: ['test-group'],
    start_date: '2021-01-01T00:00:00Z',
    end_date: '2021-12-31T23:59:59Z',
  };

  afterEach(() => {
    jest.restoreAllMocks();
    (GitLab as any).gitlab = undefined;
    (GroupFilter as any)._instance = undefined;
  });

  test('should read commits', async () => {
    const gitlab = {
      getCommits: jest.fn().mockResolvedValue([
        {
          id: 'abc123',
          message: 'Test commit',
          web_url: 'https://gitlab.example.com/group/project/-/commit/abc123',
          authored_date: '2021-06-01T12:00:00Z',
          author_name: 'John Doe',
          author_email: 'john@example.com',
          committer_name: 'John Doe',
          committer_email: 'john@example.com',
          stats: {
            additions: 10,
            deletions: 5,
            total: 15,
          },
        },
      ]),
    };

    const groupFilter = {
      getProjects: jest.fn().mockResolvedValue([
        {
          repo: {
            id: '123',
            name: 'Test Project',
            path_with_namespace: 'group/project',
            default_branch: 'main',
            group_id: 'test-group',
          },
          syncRepoData: true,
        },
      ]),
    };

    jest.spyOn(GitLab, 'instance').mockResolvedValue(gitlab as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue(groupFilter as any);

    const stream = new FarosCommits(config, logger);
    const commits: Commit[] = [];
    for await (const commit of stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      group: 'test-group',
    })) {
      commits.push(commit);
    }

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      org: 'test-group',
      repo: 'group/project',
      branch: 'main',
      oid: 'abc123',
      message: 'Test commit',
      url: 'https://gitlab.example.com/group/project/-/commit/abc123',
      authoredDate: '2021-06-01T12:00:00Z',
      author: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      committer: {
        name: 'John Doe',
        email: 'john@example.com',
      },
      additions: 10,
      deletions: 5,
      changedFilesIfAvailable: 15,
      group_id: 'test-group',
      project_id: '123',
    });
  });

  test('should skip projects with syncRepoData false', async () => {
    const gitlab = {
      getCommits: jest.fn(),
    };

    const groupFilter = {
      getProjects: jest.fn().mockResolvedValue([
        {
          repo: {
            id: '123',
            name: 'Test Project',
            path_with_namespace: 'group/project',
            default_branch: 'main',
            group_id: 'test-group',
          },
          syncRepoData: false,
        },
      ]),
    };

    jest.spyOn(GitLab, 'instance').mockResolvedValue(gitlab as any);
    jest.spyOn(GroupFilter, 'instance').mockReturnValue(groupFilter as any);

    const stream = new FarosCommits(config, logger);
    const commits: Commit[] = [];
    for await (const commit of stream.readRecords(SyncMode.FULL_REFRESH, undefined, {
      group: 'test-group',
    })) {
      commits.push(commit);
    }

    expect(commits).toHaveLength(0);
    expect(gitlab.getCommits).not.toHaveBeenCalled();
  });
});
