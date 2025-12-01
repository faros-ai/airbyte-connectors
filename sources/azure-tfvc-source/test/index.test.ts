import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {AzureDevOpsClient} from 'faros-airbyte-common/azure-devops';
import {
  readResourceAsJSON,
  readTestFileAsJSON,
  sourceCheckTest,
} from 'faros-airbyte-testing-tools';

import {AzureTfvc} from '../src/azure-tfvc';
import * as sut from '../src/index';
import {AzureTfvcConfig} from '../src/models';

const azureTfvc = AzureTfvc.instance;

describe('azure-tfvc-source', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.INFO
  );

  const cutoffDays = 90;
  const top = 100;
  const instanceType = 'cloud';
  const config = {
    access_token: 'token',
    organization: 'test-org',
    projects: ['TestProject'],
  } as AzureTfvcConfig;

  beforeEach(() => {
    AzureTfvc.instance = azureTfvc;
  });

  test('spec', async () => {
    const source = new sut.AzureTfvcSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection - success', async () => {
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      const projects = readTestFileAsJSON('projects.json');
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getChangesets: jest.fn().mockResolvedValue([]),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: config,
    });
  });

  test('check connection - no projects', async () => {
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(null),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: config,
    });
  });

  test('check connection - TFVC access error', async () => {
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      const projects = readTestFileAsJSON('projects.json');
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getChangesets: jest
              .fn()
              .mockRejectedValue(new Error('TFVC access denied')),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    await sourceCheckTest({
      source,
      configOrPath: config,
    });
  });

  test('streams - projects, use full_refresh sync mode', async () => {
    const projects = readTestFileAsJSON('projects.json');
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getBranches: jest.fn().mockResolvedValue([]),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    const streams = source.streams(config);

    const projectsStream = streams[0];
    const projectIter = projectsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {project: projects[0], organization: config.organization}
    );
    const result = [];
    for await (const project of projectIter) {
      result.push(project);
    }
    expect(result).toMatchSnapshot();
  });

  test('streams - changesets, use full_refresh sync mode', async () => {
    const projects = readTestFileAsJSON('projects.json');
    const changesetsData = readTestFileAsJSON('changesets_full.json');
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getChangesets: jest.fn().mockResolvedValue(changesetsData),
            getChangeset: jest.fn().mockImplementation((id) => {
              const changeset = changesetsData.find(
                (c: any) => c.changesetId === id
              );
              return Promise.resolve({
                ...changeset,
                hasMoreChanges: false,
              });
            }),
            getBranches: jest.fn().mockResolvedValue([]),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        true, // includeChanges
        true // includeWorkItems
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    const streams = source.streams({...config, include_changes: true, include_work_items: true});

    const changesetsStream = streams[1];
    const changesetIter = changesetsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {project: projects[0], organization: config.organization}
    );
    const result = [];
    for await (const changeset of changesetIter) {
      result.push(changeset);
    }
    expect(result).toMatchSnapshot();
  });

  test('streams - changesets with branches, use full_refresh sync mode', async () => {
    const projects = readTestFileAsJSON('projects.json');
    const branches = readTestFileAsJSON('branches.json');
    const changesetsData = readTestFileAsJSON('changesets_full.json');
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getChangesets: jest.fn().mockResolvedValue(changesetsData),
            getChangeset: jest.fn().mockImplementation((id) => {
              const changeset = changesetsData.find(
                (c: any) => c.changesetId === id
              );
              return Promise.resolve({
                ...changeset,
                hasMoreChanges: false,
              });
            }),
            getBranches: jest.fn().mockResolvedValue(branches),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        true, // includeChanges
        true // includeWorkItems
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    const streams = source.streams({...config, include_changes: true, include_work_items: true});

    const changesetsStream = streams[1];
    const syncMode = SyncMode.FULL_REFRESH;
    const result = [];
    for await (const slice of changesetsStream.streamSlices(syncMode)) {
      const changesetIter = changesetsStream.readRecords(
        syncMode,
        undefined,
        slice
      );
      for await (const changeset of changesetIter) {
        result.push(changeset);
      }
    }
    expect(result).toMatchSnapshot();
  });

  test('streams - changesets with branch filter', async () => {
    const projects = readTestFileAsJSON('projects.json');
    const branches = readTestFileAsJSON('branches.json');
    const changesetsData = readTestFileAsJSON('changesets_full.json');
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      // Only return Main branch due to filter
      const filteredBranches = branches.filter(
        (b: any) => b.path === '$/TestProject/Main'
      );
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getChangesets: jest.fn().mockResolvedValue(changesetsData),
            getChangeset: jest.fn().mockImplementation((id) => {
              const changeset = changesetsData.find(
                (c: any) => c.changesetId === id
              );
              return Promise.resolve({
                ...changeset,
                hasMoreChanges: false,
              });
            }),
            getBranches: jest.fn().mockResolvedValue(filteredBranches),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        true, // includeChanges
        true, // includeWorkItems
        '^\\$/TestProject/Main$' // branchPattern
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    const streams = source.streams({
      ...config,
      include_changes: true,
      include_work_items: true,
      branch_pattern: '^\\$/TestProject/Main$',
    });

    const changesetsStream = streams[1];
    const syncMode = SyncMode.FULL_REFRESH;
    const slices = [];
    for await (const slice of changesetsStream.streamSlices(syncMode)) {
      slices.push(slice);
    }
    // Should only have one slice for Main branch
    expect(slices).toHaveLength(1);
    expect(slices[0].branch?.path).toBe('$/TestProject/Main');
  });

  test('streams - changesets without changes', async () => {
    const projects = readTestFileAsJSON('projects.json');
    const changesetsData = readTestFileAsJSON('changesets.json');
    AzureTfvc.instance = jest.fn().mockImplementation(() => {
      return new AzureTfvc(
        {
          core: {
            getProject: jest.fn().mockResolvedValue(projects[0]),
          },
          tfvc: {
            getChangesets: jest.fn().mockResolvedValue(changesetsData),
            getChangeset: jest.fn().mockImplementation((id) => {
              const changeset = changesetsData.find(
                (c: any) => c.changesetId === id
              );
              return Promise.resolve(changeset);
            }),
            getBranches: jest.fn().mockResolvedValue([]),
          },
        } as unknown as AzureDevOpsClient,
        instanceType,
        cutoffDays,
        top,
        logger,
        false, // includeChanges
        false // includeWorkItems
      );
    });

    const source = new sut.AzureTfvcSource(logger);
    const streams = source.streams({
      ...config,
      include_changes: false,
      include_work_items: false,
    });

    const changesetsStream = streams[1];
    const changesetIter = changesetsStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      {project: projects[0], organization: config.organization}
    );
    const result = [];
    for await (const changeset of changesetIter) {
      result.push(changeset);
    }
    expect(result).toMatchSnapshot();
  });
});
