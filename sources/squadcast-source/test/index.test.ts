import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode
} from 'faros-airbyte-cdk';
import {
  readResourceAsJSON,
  readTestFileAsJSON
} from 'faros-airbyte-testing-tools';
import nock from 'nock';
import {VError} from 'verror';

import * as sut from '../src/index';
import {AUTH_URL, Squadcast} from '../src/squadcast';

const SquadcastInstance = Squadcast.instance;


describe('index', () => {
  const logger = new AirbyteSourceLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  beforeEach(() => {
    Squadcast.instance = SquadcastInstance;
  });

  test('spec', async () => {
    const source = new sut.SquadcastSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readResourceAsJSON('spec.json'))
    );
  });

  const sourceConfig = {token: 'token', cutoff_days: 90};

  test('check connection', async () => {
    Squadcast.instance = jest.fn().mockImplementation(async () => {
      return new Squadcast(
        {
          get: jest.fn().mockResolvedValue({
            data: {incidents: [], data: [{id: 'test-team-id'}]},
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        [],
        'incidentId'
      );
    });

    const source = new sut.SquadcastSource(logger);
    await expect(source.checkConnection(sourceConfig)).resolves.toStrictEqual([
      true,
      undefined,
    ]);
  });

  test('check connection - incorrect token', async () => {
    const mock = nock(AUTH_URL).get('/oauth/access-token').reply(400);

    const source = new sut.SquadcastSource(logger);
    const res = await source.checkConnection(sourceConfig);
    mock.done();

    expect(res[0]).toBe(false);
    expect(res[1]).toBeDefined();
    expect(res[1].message).toMatch(/Request failed with status code 400/);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.SquadcastSource(logger);
    await expect(
      source.checkConnection({token: '', cutoff_days: 90})
    ).resolves.toStrictEqual([
      false,
      new VError('token must not be an empty string'),
    ]);
  });

  test('streams - events, use full_refresh sync mode', async () => {
    const fnEventsFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnEventsFunc.mockImplementation(async (path: string) => {
            const isPathMatchEvents =
              /^incidents\/619cb810f88b5d9a2ab1271d\/events/.test(path);
            const isPathMatchIncidents = /^incidents\/export/.test(path);
            const isPathMatchTeams = /^teams/.test(path);
            const res: any = {
              data: {data: {events: []}, incidents: []},
            };
            if (isPathMatchEvents)
              res.data.data.events = readTestFileAsJSON('events.json');
            if (isPathMatchIncidents)
              res.data.incidents = readTestFileAsJSON('incidents.json');
            if (isPathMatchTeams) res.data.data = [{id: 'test-team-id'}];

            return res;
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        []
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams(sourceConfig);

    const eventsStream = streams[0];
    const eventsIter = eventsStream.readRecords(SyncMode.FULL_REFRESH);
    const events = [];
    for await (const event of eventsIter) {
      events.push(event);
    }

    expect(fnEventsFunc).toHaveBeenCalledTimes(6);
    expect(events).toStrictEqual(readTestFileAsJSON('events.json'));
  });

  test('streams - incidents, use full_refresh sync mode', async () => {
    const fnIncidentsFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnIncidentsFunc.mockImplementation(async (path: string) => {
            const isPathMatch = /^incidents\/export/.test(path);
            if (isPathMatch) {
              return {
                data: {incidents: readTestFileAsJSON('incidents.json')},
              };
            }
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        [],
        'incidentId-123'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams(sourceConfig);

    const incidentsStream = streams[1];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsFunc).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestFileAsJSON('incidents.json'));
  });

  test('streams - services, use full_refresh sync mode', async () => {
    const fnServicesFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnServicesFunc.mockResolvedValue({
            data: {data: readTestFileAsJSON('services.json')},
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        [],
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams(sourceConfig);

    const servicesStream = streams[2];
    const servicesIter = servicesStream.readRecords(SyncMode.FULL_REFRESH);
    const services = [];
    for await (const service of servicesIter) {
      services.push(service);
    }

    expect(fnServicesFunc).toHaveBeenCalledTimes(1);
    expect(services).toStrictEqual(readTestFileAsJSON('services.json'));
  });

  test('streams - services filtered', async () => {
    const fnServicesFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnServicesFunc.mockResolvedValue({
            data: {data: readTestFileAsJSON('services.json')},
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        ['example-service', 'bogus-service'],
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams(sourceConfig);

    const servicesStream = streams[2];
    const servicesIter = servicesStream.readRecords(SyncMode.FULL_REFRESH);
    const services = [];
    for await (const service of servicesIter) {
      services.push(service);
    }

    expect(fnServicesFunc).toHaveBeenCalledTimes(1);
    expect(services).toStrictEqual(readTestFileAsJSON('services.json'));
  });

  test('streams - services all filtered out', async () => {
    const fnServicesFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnServicesFunc.mockResolvedValue({
            data: {data: readTestFileAsJSON('services.json')},
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        ['bogus-service'],
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams(sourceConfig);

    const servicesStream = streams[2];
    const servicesIter = servicesStream.readRecords(SyncMode.FULL_REFRESH);
    const services = [];
    for await (const service of servicesIter) {
      services.push(service);
    }

    expect(fnServicesFunc).toHaveBeenCalledTimes(1);
    expect(services).toStrictEqual([]);
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnUsersFunc.mockResolvedValue({
            data: {data: readTestFileAsJSON('users.json')},
          }),
        } as any,
        new Date('2010-03-27T14:03:51-0800'),
        [],
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams(sourceConfig);

    const usersStream = streams[3];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestFileAsJSON('users.json'));
  });
});
