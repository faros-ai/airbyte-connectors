import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
  readResourceFile,
  readResourceAsJSON,
  readTestResourceFile,
  readTestResourceAsJSON,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Statuspage} from '../src/statuspage';
import {Component, ComponentGroup, Page} from '../src/types';

const statusPageInstance = Statuspage.instance;


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Statuspage.instance = statusPageInstance;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.StatuspageSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceFile('spec.json'))
    );
  });

  const sourceConfig = {
    api_key: '',
    page_ids: ['n3wb7hf336hn', 'mz1ms2kfwq1s'],
    cutoff_days: 90,
    org_id: 'org_id',
    fetch_component_uptime: true,
  };

  test('check connection', async () => {
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {get: jest.fn().mockResolvedValue({})} as any,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });

    const source = new sut.StatuspageSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect page_id', async () => {
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {get: jest.fn().mockRejectedValue(new Error('some error'))} as any,
        new Date('2010-03-27T14:03:51-0800'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      false,
      new VError('Please verify your token is correct. Error: some error'),
    ]);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.StatuspageSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      false,
      new VError('api_key must not be an empty string'),
    ]);
    await expect(
      source.checkConnection({
        ...sourceConfig,
        api_key: 'key',
        cutoff_days: null,
      })
    ).resolves.toStrictEqual([
      false,
      new VError('cutoff_days must be an integer greater than 0'),
    ]);
    await expect(
      source.checkConnection({...sourceConfig, api_key: 'key', max_retries: -1})
    ).resolves.toStrictEqual([
      false,
      new VError('max_retries must be an integer greater than 0'),
    ]);
    await expect(
      source.checkConnection({...sourceConfig, api_key: 'key', page_size: 1.5})
    ).resolves.toStrictEqual([
      false,
      new VError('page_size must be an integer between 1 and 100'),
    ]);
  });

  test('streams - component groups, use full_refresh sync mode', async () => {
    const fnComponentGroupsFunc = jest.fn();
    const expectedData: ReadonlyArray<ComponentGroup> = readTestResourceFile(
      'component_groups.json'
    );
    const sp = new Statuspage(
      {
        get: fnComponentGroupsFunc
          .mockResolvedValueOnce({data: [expectedData[0]]})
          .mockResolvedValueOnce({data: [expectedData[1]]})
          .mockResolvedValueOnce({data: []}),
      } as any,
      new Date('1970-01-01T00:00:00-0000'),
      logger,
      3,
      1
    );
    Statuspage.instance = jest.fn().mockReturnValue(sp);
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams({...sourceConfig, page_size: 1});

    const componentGroupsStream = streams[0];
    const componentGroupsIter = componentGroupsStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {pageId: 'page_id'}
    );
    const groups = [];
    for await (const group of componentGroupsIter) {
      groups.push(group);
    }

    expect(fnComponentGroupsFunc).toHaveBeenCalledTimes(3);
    expect(groups).toStrictEqual(expectedData);
  });

  test('streams - components, use full_refresh sync mode', async () => {
    const fnComponentsFunc = jest.fn();
    const expectedData: ReadonlyArray<Component> =
      readTestResourceFile('components.json');
    const sp = new Statuspage(
      {
        get: fnComponentsFunc
          .mockResolvedValueOnce({data: [expectedData[0]]})
          .mockResolvedValueOnce({data: [expectedData[1]]})
          .mockResolvedValueOnce({data: []}),
      } as any,
      new Date('1970-01-01T00:00:00-0000'),
      logger,
      3,
      1
    );
    Statuspage.instance = jest.fn().mockReturnValue(sp);
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams({...sourceConfig, page_size: 1});

    const componentsStream = streams[1];
    const componentsIter = componentsStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {pageId: 'page_id'}
    );
    const components = [];
    for await (const group of componentsIter) {
      components.push(group);
    }

    expect(fnComponentsFunc).toHaveBeenCalledTimes(3);
    expect(components).toStrictEqual(expectedData);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsFunc = jest.fn();
    const inputIncidents: any[] = readTestResourceFile('incidents.json');
    Statuspage.instance = jest.fn().mockImplementation(() => {
      let idx = 0;
      return new Statuspage(
        {
          get: fnIncidentsFunc.mockImplementation(() => {
            const incident = inputIncidents[idx++];
            return Promise.resolve({data: incident ? [incident] : []});
          }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger,
        3,
        1
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[2];
    const incidentsIter = incidentsStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {pageId: 'page_id'}
    );
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsFunc).toHaveBeenCalledTimes(4);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - pages, use full_refresh sync mode', async () => {
    const fnPagesFunc = jest.fn();

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnPagesFunc.mockResolvedValue({
            data: readTestResourceFile('pages.json'),
          }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const pagesStream = streams[3];
    const pagesIter = pagesStream.readRecords(SyncMode.FULL_REFRESH);
    const pages = [];
    for await (const page of pagesIter) {
      pages.push(page);
    }

    expect(fnPagesFunc).toHaveBeenCalledTimes(1);
    expect(pages).toStrictEqual(readTestResourceFile('pages.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();
    const sp = new Statuspage(
      {
        get: fnUsersFunc.mockResolvedValueOnce({
          data: readTestResourceFile('users.json'),
        }),
      } as any,
      new Date('1970-01-01T00:00:00-0000'),
      logger
    );
    Statuspage.instance = jest.fn().mockReturnValue(sp);
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const usersStream = streams[4];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });

  test('streams - component uptimes, use full_refresh sync mode', async () => {
    const fnComponentUptimesFunc = jest.fn();
    const componentUptime = readTestResourceFile('component_uptimes.json');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnComponentUptimesFunc.mockResolvedValue({
            data: componentUptime,
          }),
        } as any,
        startDate,
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const componentUptimesStream = streams[5];
    const uptimesIter = componentUptimesStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {pageId: 'page_id', componentId: 'component1', startDate: '2021-01-01'}
    );
    const componentUptimes = [];
    for await (const uptime of uptimesIter) {
      componentUptimes.push(uptime);
    }

    const expected = {
      ...componentUptime,
      page_id: 'page_id',
      group_id: undefined,
    };
    expect(fnComponentUptimesFunc).toHaveBeenCalledTimes(3);
    expect(componentUptimes).toStrictEqual([...Array(3).fill(expected)]);
  });

  test('streams - component uptimes, use incremental sync mode', async () => {
    const fnComponentUptimesFunc = jest.fn();
    const componentUptime = readTestResourceFile('component_uptimes.json');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnComponentUptimesFunc.mockResolvedValue({
            data: componentUptime,
          }),
        } as any,
        startDate,
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() - 1);

    const componentUptimesStream = streams[5];
    const uptimesIter = componentUptimesStream.readRecords(
      SyncMode.INCREMENTAL,
      null,
      {pageId: 'page_id', componentId: 'component1', startDate: '2021-01-01'},
      {page_id: {component1: {rangeEnd: rangeEnd.toISOString()}}}
    );
    const componentUptimes = [];
    for await (const uptime of uptimesIter) {
      componentUptimes.push(uptime);
    }

    const expected = {
      ...componentUptime,
      page_id: 'page_id',
      group_id: undefined,
    };
    expect(fnComponentUptimesFunc).toHaveBeenCalledTimes(1);
    expect(componentUptimes).toStrictEqual([expected]);
  });

  test('streams - component uptimes, fetch uptimes disabled', async () => {
    const fnStreamSlicesFunc = jest.fn();
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnStreamSlicesFunc.mockResolvedValue({}),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams({
      ...sourceConfig,
      fetch_component_uptime: false,
    });

    const componentUptimesStream = streams[5];
    const slicesIter = componentUptimesStream.streamSlices(
      SyncMode.FULL_REFRESH
    );
    const slices = [];
    for await (const slice of slicesIter) {
      slices.push(slice);
    }

    expect(fnStreamSlicesFunc).toHaveBeenCalledTimes(0);
    expect(slices).toHaveLength(0);
  });

  test('streams - component uptimes, fetch max 90 days', async () => {
    const fnComponentUptimesFunc = jest.fn();
    const componentUptime = readTestResourceFile('component_uptimes.json');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1000);
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnComponentUptimesFunc.mockResolvedValue({
            data: componentUptime,
          }),
        } as any,
        startDate,
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const componentUptimesStream = streams[5];
    const uptimesIter = componentUptimesStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {pageId: 'page_id', componentId: 'component1', startDate: '2021-01-01'}
    );
    const componentUptimes = [];
    for await (const uptime of uptimesIter) {
      componentUptimes.push(uptime);
    }

    const expected = {
      ...componentUptime,
      page_id: 'page_id',
      group_id: undefined,
    };
    expect(fnComponentUptimesFunc).toHaveBeenCalledTimes(90);
    expect(componentUptimes).toStrictEqual([...Array(90).fill(expected)]);
  });

  test('streams - component uptimes, use component start date', async () => {
    const fnComponentUptimesFunc = jest.fn();
    const componentUptime = readTestResourceFile('component_uptimes.json');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1000);
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnComponentUptimesFunc.mockResolvedValue({
            data: componentUptime,
          }),
        } as any,
        startDate,
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const componentStartDate = new Date();
    componentStartDate.setDate(componentStartDate.getDate() - 10);

    const componentUptimesStream = streams[5];
    const uptimesIter = componentUptimesStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {
        pageId: 'page_id',
        componentId: 'component1',
        startDate: componentStartDate.toISOString(),
      }
    );
    const componentUptimes = [];
    for await (const uptime of uptimesIter) {
      componentUptimes.push(uptime);
    }

    const expected = {
      ...componentUptime,
      page_id: 'page_id',
      group_id: undefined,
    };
    expect(fnComponentUptimesFunc).toHaveBeenCalledTimes(10);
    expect(componentUptimes).toStrictEqual([...Array(10).fill(expected)]);
  });

  test('streams - component showcase disabled', async () => {
    const fnStreamSlicesFunc = jest.fn();
    const pages: ReadonlyArray<Page> = readTestResourceFile('pages.json');
    const components: ReadonlyArray<Component> =
      readTestResourceFile('components.json');

    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnStreamSlicesFunc
            .mockResolvedValueOnce({data: [pages[0]]})
            .mockResolvedValueOnce({
              data: [components[1], {...components[0], showcase: false}],
            }),
        } as any,
        new Date('1970-01-01T00:00:00-0000'),
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);

    const componentUptimesStream = streams[5];
    const slicesIter = componentUptimesStream.streamSlices(
      SyncMode.FULL_REFRESH
    );
    const slices = [];
    for await (const slice of slicesIter) {
      slices.push(slice);
    }

    expect(fnStreamSlicesFunc).toHaveBeenCalledTimes(2);
    expect(slices).toStrictEqual([
      {
        pageId: 'n3wb7hf336hn',
        componentId: 'component2',
        startDate: '2023-05-22',
        componentGroupId: 'string',
      },
    ]);
  });

  test('streams - component uptimes, sub-components', async () => {
    const fnComponentUptimesFunc = jest.fn();
    const componentUptime = readTestResourceFile('component_uptimes.json');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    Statuspage.instance = jest.fn().mockImplementation(() => {
      return new Statuspage(
        {
          get: fnComponentUptimesFunc.mockResolvedValue({
            data: componentUptime,
          }),
        } as any,
        startDate,
        logger
      );
    });
    const source = new sut.StatuspageSource(logger);
    const streams = source.streams(sourceConfig);
    const componentUptimesStream = streams[5];
    const uptimesIter = componentUptimesStream.readRecords(
      SyncMode.FULL_REFRESH,
      null,
      {
        pageId: 'page_id',
        componentId: 'component1',
        startDate: '2021-01-01',
        componentGroupId: 'group_id',
      }
    );
    const componentUptimes = [];
    for await (const uptime of uptimesIter) {
      componentUptimes.push(uptime);
    }

    const expectedUptime = {
      ...componentUptime,
      page_id: 'page_id',
      group_id: 'group_id',
    };
    expect(fnComponentUptimesFunc).toHaveBeenCalledTimes(1);
    expect(componentUptimes).toStrictEqual([expectedUptime]);
  });
});
