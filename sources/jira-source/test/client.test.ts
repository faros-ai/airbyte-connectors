import axios from 'axios';
import {BaseClient} from 'jira.js';
import {DateTime} from 'luxon';

import * as sut from '../src/client';
import {WithRetry} from '../src/retry';

jest.mock('axios');
jest.mock('faros-js-client');

function apiError(status: number, headers: Record<string, any> = {}): Error {
  const err = new Error('API error');
  (err as any).status = status;
  (err as any).cause = {response: headers};
  return err;
}

describe('client', () => {
  const project = {
    id: 1,
    key: 'PJ',
    name: 'Project',
    description: 'Description',
  };

  const ClientWithRetry = WithRetry(BaseClient, true, 3, 5000);

  function getProject(projectIdOrKey: string, isCloud = true): Promise<any> {
    const client = new sut.JiraClient({
      host: 'http://test.test',
      authentication: {
        basic: {username: 'username', password: 'password'},
      },
      isCloud,
      retryDelay: 5000,
      maxRetries: 1,
    });
    return client.v2.projects.getProject({projectIdOrKey});
  }

  beforeEach(() => jest.clearAllMocks());

  test('succeeds on 200', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest.fn().mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).resolves.toEqual(project);
  });

  test('fails on 404', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(400))
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).rejects.toEqual(apiError(400));
  });

  test('cloud fails on 400', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(400, {headers: {'x-ausername': 'anonymous'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).rejects.toEqual(apiError(400));
  });

  test('server retries on 400 with anonymous user', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(400, {headers: {'x-ausername': 'anonymous'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key, false)).resolves.toEqual(project);
  });

  test('server fails on 400 with real user', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(400, {headers: {'x-ausername': 'admin'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key, false)).rejects.toEqual(apiError(400));
  });

  test('server retries on 401 with anonymous user', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(401, {headers: {'x-ausername': 'anonymous'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key, false)).resolves.toEqual(project);
  });

  test('server fails on 401 with real user', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(400, {headers: {'x-ausername': 'admin'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key, false)).rejects.toEqual(apiError(400));
  });

  test('server retries on 404 with anonymous user', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(404, {headers: {'x-ausername': 'anonymous'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key, false)).resolves.toEqual(project);
  });

  test('server fails on 404 with real user', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(
              apiError(400, {headers: {'x-ausername': 'admin'}})
            )
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key, false)).rejects.toEqual(apiError(400));
  });

  test('retries on 429', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(429))
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).resolves.toEqual(project);
  });

  test('fails on repeated 429s', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(429))
            .mockRejectedValueOnce(apiError(429))
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).rejects.toEqual(apiError(429));
  });

  test('retries on 500', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(500))
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).resolves.toEqual(project);
  });

  test('fails on repeated 500s', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(500))
            .mockRejectedValueOnce(apiError(500))
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).rejects.toEqual(apiError(500));
  });

  test('retries on ETIMEDOUT', async () => {
    const error: any = new Error('connect ETIMEDOUT url');
    error.code = 'ETIMEDOUT';
    error.cause = undefined;
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).resolves.toEqual(project);
  });

  test('fails on repeated ETIMEDOUT)', async () => {
    const error: any = new Error('connect ETIMEDOUT url');
    error.code = 'ETIMEDOUT';
    error.cause = undefined;
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(error)
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce({data: project}),
        }) as any
    );
    await expect(getProject(project.key)).rejects.toEqual(error);
  });

  test('agile client has retries on 500', async () => {
    const board = {id: 1, name: 'board 1'};
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(500))
            .mockResolvedValueOnce({data: board}),
        }) as any
    );

    const client = new sut.JiraClient({
      host: 'http://test.test',
      authentication: {
        basic: {username: 'username', password: 'password'},
      },
      isCloud: true,
      maxRetries: 1,
      retryDelay: 5000,
    });
    await expect(client.agile.board.getBoard({boardId: 1})).resolves.toEqual(
      board
    );
  });

  test('internal api client has retries', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest
            .fn()
            .mockRejectedValueOnce(apiError(500))
            .mockResolvedValueOnce({data: [project]}),
        }) as any
    );

    const client = new sut.JiraClient({
      host: 'http://test.test',
      authentication: {
        basic: {username: 'username', password: 'password'},
      },
      isCloud: true,
      maxRetries: 1,
      retryDelay: 5000,
    });
    await expect(client.getAllProjects()).resolves.toEqual([project]);
  });

  test('gets attempt delay', () => {
    const delay1 = ClientWithRetry.getDelay(1, {});
    expect(delay1).toBeGreaterThanOrEqual(5000);
    expect(delay1).toBeLessThanOrEqual(5500);

    const delay2 = ClientWithRetry.getDelay(2, {});
    expect(delay2).toBeGreaterThanOrEqual(10_000);
    expect(delay2).toBeLessThanOrEqual(10_500);

    const delay3 = ClientWithRetry.getDelay(3, {});
    expect(delay3).toBeGreaterThanOrEqual(15_000);
    expect(delay3).toBeLessThanOrEqual(15_500);
  });

  test('gets attempt delay when undefined response', () => {
    const delay1 = ClientWithRetry.getDelay(1, undefined);
    expect(delay1).toBeGreaterThanOrEqual(5000);
    expect(delay1).toBeLessThanOrEqual(5500);

    const delay2 = ClientWithRetry.getDelay(2, undefined);
    expect(delay2).toBeGreaterThanOrEqual(10_000);
    expect(delay2).toBeLessThanOrEqual(10_500);

    const delay3 = ClientWithRetry.getDelay(3, undefined);
    expect(delay3).toBeGreaterThanOrEqual(15_000);
    expect(delay3).toBeLessThanOrEqual(15_500);
  });

  test('gets delay from Retry-After header', () => {
    const response = {headers: {'retry-after': '60'}};
    const delay = ClientWithRetry.getDelay(1, response);
    expect(delay).toBeGreaterThanOrEqual(60_000);
    expect(delay).toBeLessThanOrEqual(60_500);
  });

  test('gets delay from X-RateLimit-Reset header', () => {
    const reset = DateTime.utc().plus({minutes: 1, seconds: 1}).toISO();
    const response = {headers: {'X-RateLimit-Reset': reset}};
    const delay = ClientWithRetry.getDelay(1, response);
    expect(delay).toBeGreaterThanOrEqual(61_000);
    expect(delay).toBeLessThanOrEqual(61_500);
  });

  test('ignores invalid Retry-After header', () => {
    const response = {headers: {'Retry-After': 'invalid'}};
    const delay = ClientWithRetry.getDelay(1, response);
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(5500);
  });

  test('ignores invalid X-RateLimit-Reset header', () => {
    const response = {headers: {'X-RateLimit-Reset': 'invalid'}};
    const delay = ClientWithRetry.getDelay(1, response);
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(5500);
  });

  test('uses attempt delay if larger than response delay', () => {
    const response = {headers: {'retry-after': '2'}};
    const delay = ClientWithRetry.getDelay(1, response);
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(5500);
  });

  test('get API stats', async () => {
    jest.mocked(axios.create).mockImplementation(
      () =>
        ({
          getUri: jest.fn().mockReturnValue('uri'),
          request: jest.fn().mockResolvedValue({data: [project]}),
        }) as any
    );

    const client = new sut.JiraClient({
      host: 'http://test.test',
      authentication: {
        basic: {username: 'username', password: 'password'},
      },
      maxRetries: 1,
      isCloud: true,
      retryDelay: 5000,
    });
    await Promise.all([
      // V2Client calls
      client.v2.projects.searchProjects(),
      client.v2.workflowStatuses.getStatuses(),
      client.agile.board.getAllBoards(),
      client.agile.board.getAllSprints({boardId: 1}),
      client.getDevStatusSummary('1'),
    ]);
    expect(client.getStats()).toStrictEqual({
      totalCalls: 5,
      '/rest/agile/1.0/board': 1,
      '/rest/agile/1.0/board/1/sprint': 1,
      '/rest/dev-status/1.0/issue/summary': 1,
      '/rest/api/2/project/search': 1,
      '/rest/api/2/status': 1,
    });
  });
});
