import {PartialCall} from '@pagerduty/pdjs/build/src/api';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestFileAsJSON,
} from 'faros-airbyte-testing-tools';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Incident, Pagerduty} from '../src/pagerduty';

describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('spec', async () => {
    const source = new sut.PagerdutySource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  test('check connection', async () => {
    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {get: jest.fn().mockResolvedValue({})} as unknown as PartialCall,
        logger
      );
    });

    const source = new sut.PagerdutySource(logger);
    await expect(
      source.checkConnection({
        token: 'token',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: jest.fn().mockRejectedValue('some text'),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    await expect(
      source.checkConnection({
        token: 'token',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your token are correct. Error: err must be an Error'
      ),
    ]);
  });

  test('streams - incidentLogEntries, use full_refresh sync mode', async () => {
    const fnIncidentLogEntriesList = jest.fn();

    const expectedEntries = readTestFileAsJSON('incidentLogEntries.json').map(
      (entry) => {
        return {...entry, created_at: new Date().toISOString()};
      }
    );
    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnIncidentLogEntriesList
            .mockResolvedValueOnce({
              resource: expectedEntries,
            })
            .mockResolvedValue({resource: []}),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const incidentLogEntriesStream = streams[0];
    const incidentLogEntriesIter = incidentLogEntriesStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const incidentLogEntries = [];
    for await (const logEntry of incidentLogEntriesIter) {
      incidentLogEntries.push(logEntry);
    }
    expect(fnIncidentLogEntriesList).toHaveBeenCalledTimes(90);
    expect(incidentLogEntries).toStrictEqual(expectedEntries);
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnIncidentsList
            .mockResolvedValueOnce({
              resource: readTestFileAsJSON('incidents.json'),
            })
            .mockResolvedValue({resource: []}),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const incidentsStream = streams[1];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsList).toHaveBeenCalledTimes(90);
    expect(incidents).toStrictEqual(readTestFileAsJSON('incidents.json'));
  });

  test('streams - incidents, exclude services', async () => {
    const fnList = jest.fn();
    let returnedIncidents = false;

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnList.mockImplementation(async (path: string) => {
            const incidentsPathMatch = path.match(/^\/incidents/);
            if (incidentsPathMatch) {
              const includeServices = decodeURIComponent(path)
                .split('&')
                .filter((p) => p.startsWith('service_ids[]='))
                .map((p) => p.split('=')[1]);
              if (returnedIncidents) {
                return {resource: []};
              }
              returnedIncidents = true;
              return {
                resource: (
                  readTestFileAsJSON('incidents.json') as Incident[]
                ).filter((i) => includeServices.includes(i.service.id)),
              };
            }
            const servicesPathMatch = path.match(/^\/services/);
            if (servicesPathMatch) {
              return {
                resource: readTestFileAsJSON('services.json'),
              };
            }
          }),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
      exclude_services: ['Service2'],
    });

    const incidentsStream = streams[1];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnList).toHaveBeenCalledTimes(91); // list services once + 90 days
    expect(incidents).toStrictEqual(
      (readTestFileAsJSON('incidents.json') as Incident[]).filter(
        (i) => i.service.summary !== 'Service2'
      )
    );
  });

  test('streams - prioritiesResource, use full_refresh sync mode', async () => {
    const fnPrioritiesResourceList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnPrioritiesResourceList.mockImplementation(
            async (path: string) => {
              const isPathMatch = path.match(/^\/priorities/);
              if (isPathMatch) {
                return {
                  resource: readTestFileAsJSON('prioritiesResource.json'),
                  response: {
                    ok: true,
                  },
                };
              }
            }
          ),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const prioritiesResourceStream = streams[2];
    const prioritiesResourceIter = prioritiesResourceStream.readRecords(
      SyncMode.FULL_REFRESH
    );
    const priorities = [];
    for await (const priority of prioritiesResourceIter) {
      priorities.push(priority);
    }

    expect(fnPrioritiesResourceList).toHaveBeenCalledTimes(1);
    expect(priorities).toStrictEqual(
      readTestFileAsJSON('prioritiesResource.json')
    );
  });

  test('streams - services, use full_refresh sync mode', async () => {
    const fnServicesList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnServicesList.mockImplementation(async (path: string) => {
            const isPathMatch = path.match(/^\/services/);
            if (isPathMatch) {
              return {
                resource: readTestFileAsJSON('services.json'),
                response: {
                  ok: true,
                },
              };
            }
          }),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const servicesStream = streams[3];
    const iter = servicesStream.readRecords(SyncMode.FULL_REFRESH);
    const service = [];
    for await (const priority of iter) {
      service.push(priority);
    }

    expect(fnServicesList).toHaveBeenCalledTimes(1);
    expect(service).toStrictEqual(readTestFileAsJSON('services.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersList = jest.fn();

    Pagerduty.instance = jest.fn().mockImplementation(() => {
      return new Pagerduty(
        {
          get: fnUsersList.mockImplementation(async (path: string) => {
            const isPathMatch = path.match(/^\/users/);
            if (isPathMatch) {
              return {
                resource: readTestFileAsJSON('users.json'),
              };
            }
          }),
        } as unknown as PartialCall,
        logger
      );
    });
    const source = new sut.PagerdutySource(logger);
    const streams = source.streams({
      token: 'pass',
    });

    const usersStream = streams[4];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }
    expect(fnUsersList).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestFileAsJSON('users.json'));
  });
});
