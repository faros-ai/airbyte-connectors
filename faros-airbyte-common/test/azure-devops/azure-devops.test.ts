import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';

import {AzureDevOps} from '../../src/azure-devops/azure-devops';
import {
  AzureDevOpsClient,
  AzureDevOpsConfig,
} from '../../src/azure-devops/types';

jest.mock('azure-devops-node-api');

const paginationItems = [
  {id: 1, name: 'item1'},
  {id: 2, name: 'item2'},
  {id: 3, name: 'item3'},
  {id: 4, name: 'item4'},
  {id: 5, name: 'item5'},
];

describe('client', () => {
  class TestAzureDevOps extends AzureDevOps {}

  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  const config = {
    access_token: 'access_token',
    organization: 'organization',
    instance: {
      type: 'cloud',
    },
  } as AzureDevOpsConfig;

  beforeEach(() => {
    (AzureDevOps as any).azureDevOps = null;
  });

  test('valid config for azure devops services (cloud)', async () => {
    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(azureDevOps).toBeInstanceOf(AzureDevOps);
  });

  test('valid config for azure devops server', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: 'https://my-server.com',
      },
    } as AzureDevOpsConfig;

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(azureDevOps).toBeInstanceOf(AzureDevOps);
  });

  test('missing access_token in config', async () => {
    const config = {
      access_token: null,
      organization: 'organization',
    };
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
      'access_token must not be an empty string'
    );
  });

  test('missing organization in config', async () => {
    const config = {
      access_token: 'access_token',
      organization: null,
    };
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
      'organization must not be an empty string'
    );
  });

  test('missing api url for server instance', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: null,
      },
    } as AzureDevOpsConfig;
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
      'api_url must not be an empty string for server instance type'
    );
  });

  test('invalid api url for server instance', async () => {
    const config = {
      access_token: 'access_token',
      organization: 'organization',
      instance: {
        type: 'server',
        api_url: 'invalid_api_url',
      },
    } as AzureDevOpsConfig;
    await expect(TestAzureDevOps.instance(config, logger)).rejects.toThrow(
      'Invalid URL: invalid_api_url'
    );
  });

  test('paginate with skip parameter', async () => {
    const getPage = (pageSize: number, skip: number) => {
      return paginationItems.slice(skip, skip + pageSize);
    };

    for (const pageSize of [2, 3, 4]) {
      const azureDevOps = await TestAzureDevOps.instance(
        {...config, page_size: pageSize},
        logger
      );

      const mockGetFn = jest.fn((top: number, skip: number | string) =>
        Promise.resolve(getPage(top, skip as number))
      );

      const results = [];
      for await (const item of azureDevOps['getPaginated'](mockGetFn)) {
        results.push(item);
      }

      // Verify all items are returned
      expect(results).toEqual(paginationItems);

      // Verify calls
      const expectedCalls = Math.ceil(paginationItems.length / pageSize);
      expect(mockGetFn).toHaveBeenCalledTimes(expectedCalls);

      // Verify parameters for each call
      const calls = mockGetFn.mock.calls;
      calls.forEach((call, index) => {
        const top = Math.max(2, pageSize);
        expect(call[0]).toEqual(top); // top parameter
        expect(call[1]).toEqual(index * top); // skip parameter
      });

      mockGetFn.mockClear();
      (AzureDevOps as any).azureDevOps = null;
    }
  });

  test('paginate with continuation token', async () => {
    const getPage = (pageSize: number, continuationToken?: number) => {
      const startIndex = continuationToken
        ? paginationItems.findIndex((item) => item.id === continuationToken)
        : 0;
      return paginationItems.slice(startIndex, startIndex + pageSize);
    };

    const pageSizeCalls = [
      [1, 5],
      [2, 5],
      [5, 2],
      [10, 1],
    ];

    for (const [pageSize, numCalls] of pageSizeCalls) {
      const azureDevOps = await TestAzureDevOps.instance(
        {...config, page_size: pageSize},
        logger
      );

      const mockGetFn = jest.fn(
        (top: number, continuationToken?: string | number) =>
          Promise.resolve(getPage(top, continuationToken as number))
      );

      const results = [];
      for await (const item of azureDevOps['getPaginated'](mockGetFn, {
        useContinuationToken: true,
        continuationTokenParam: 'id',
      })) {
        results.push(item);
      }

      expect(results).toEqual(paginationItems);
      expect(mockGetFn).toHaveBeenCalledTimes(numCalls);

      const calls = mockGetFn.mock.calls;
      const effectivePageSize = Math.max(2, pageSize);
      calls.forEach((call, index) => {
        expect(call[0]).toEqual(effectivePageSize);

        if (index === 0) {
          expect(call[1]).toBeUndefined();
        } else {
          const lastItemIndex = index * (effectivePageSize - 1);
          expect(call[1]).toEqual(paginationItems.at(lastItemIndex).id);
        }
      });

      mockGetFn.mockClear();
      (AzureDevOps as any).azureDevOps = null;
    }
  });

  test('paginate with continuation token handles non-array results', async () => {
    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    const mockGetFn = jest.fn().mockResolvedValue({error: 'invalid response'});

    await expect(async () => {
      for await (const _ of azureDevOps['getPaginated'](mockGetFn, {
        useContinuationToken: true,
        continuationTokenParam: 'id',
      })) {
        // Do nothing
      }
    }).rejects.toThrow('Expected array result but got object');
  });

  test('paginate with continuation token handles empty results', async () => {
    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    const mockGetFn = jest.fn().mockResolvedValue(undefined);

    const results = [];
    for await (const item of azureDevOps['getPaginated'](mockGetFn, {
      useContinuationToken: true,
      continuationTokenParam: 'id',
    })) {
      results.push(item);
    }
    expect(mockGetFn).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });

  test('get projects (no projects provided)', async () => {
    TestAzureDevOps.instance = jest.fn().mockImplementation(() => {
      return new TestAzureDevOps(
        {
          core: {
            getProjects: jest
              .fn()
              .mockResolvedValueOnce(readTestResourceAsJSON('projects.json')),
          },
        } as unknown as AzureDevOpsClient,
        90,
        100,
        logger
      );
    });

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(await azureDevOps.getProjects()).toMatchSnapshot();
  });

  test('get projects (empty list provided)', async () => {
    TestAzureDevOps.instance = jest.fn().mockImplementation(() => {
      return new TestAzureDevOps(
        {
          core: {
            getProjects: jest
              .fn()
              .mockResolvedValueOnce(readTestResourceAsJSON('projects.json')),
          },
        } as unknown as AzureDevOpsClient,
        90,
        100,
        logger
      );
    });

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(await azureDevOps.getProjects([])).toMatchSnapshot();
  });

  test('get projects (list provided)', async () => {
    TestAzureDevOps.instance = jest.fn().mockImplementation(() => {
      const projects = readTestResourceAsJSON('projects.json');
      return new TestAzureDevOps(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValueOnce(projects.at(2))
              .mockResolvedValueOnce(projects.at(1)),
          },
        } as unknown as AzureDevOpsClient,
        90,
        100,
        logger
      );
    });

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(
      await azureDevOps.getProjects(['TestGit', 'Fabrikam-Fiber-Git'])
    ).toMatchSnapshot();
  });

  test('get projects (invalid project provided)', async () => {
    TestAzureDevOps.instance = jest.fn().mockImplementation(() => {
      const projects = readTestResourceAsJSON('projects.json');
      return new TestAzureDevOps(
        {
          core: {
            getProject: jest
              .fn()
              .mockResolvedValueOnce(projects.at(2))
              .mockResolvedValueOnce(undefined),
          },
        } as unknown as AzureDevOpsClient,
        90,
        100,
        logger
      );
    });

    const azureDevOps = await TestAzureDevOps.instance(config, logger);
    expect(
      await azureDevOps.getProjects(['TestGit', 'InvalidProject'])
    ).toMatchSnapshot();
  });
});
