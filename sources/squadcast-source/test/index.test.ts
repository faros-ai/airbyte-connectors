import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import * as sut from '../src/index';
import {Squadcast} from '../src/squadcast';

const SquadcastInstance = Squadcast.instance;

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  const logger = new AirbyteLogger(
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
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    Squadcast.instance = jest.fn().mockImplementation(async () => {
      return new Squadcast(
        {get: jest.fn().mockResolvedValue({data: {incidents: []}})} as any,
        'incidentId'
      );
    });

    const source = new sut.SquadcastSource(logger);
    await expect(
      source.checkConnection({token: 'token'})
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect token', async () => {
    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: jest.fn().mockRejectedValue(new Error('some error')),
        } as any,
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    await expect(source.checkConnection({})).resolves.toStrictEqual([
      false,
      new VError('Please verify your token are correct. Error: some error'),
    ]);
  });

  test('check connection - incorrect variables', async () => {
    const source = new sut.SquadcastSource(logger);
    await expect(source.checkConnection({})).resolves.toStrictEqual([
      false,
      new VError('token must be a not empty string'),
    ]);
  });

  test('streams - events, use full_refresh sync mode', async () => {
    const fnEventsFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast({
        get: fnEventsFunc.mockImplementation(async (path: string) => {
          const isPathMatchEvents =
            /^incidents\/619cb810f88b5d9a2ab1271d\/events/.test(path);
          const isPathMatchIncidents = /^incidents\/export/.test(path);
          if (isPathMatchEvents) {
            return {
              data: {data: {events: readTestResourceFile('events.json')}},
            };
          }
          if (isPathMatchIncidents) {
            return {
              data: {incidents: readTestResourceFile('incidents.json')},
            };
          }
          return {data: {data: {events: []}}};
        }),
      } as any);
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams({});

    const eventsStream = streams[0];
    const eventsIter = eventsStream.readRecords(SyncMode.FULL_REFRESH);
    const events = [];
    for await (const event of eventsIter) {
      events.push(event);
    }

    expect(fnEventsFunc).toHaveBeenCalledTimes(5);
    expect(events).toStrictEqual(readTestResourceFile('events.json'));
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
                data: {incidents: readTestResourceFile('incidents.json')},
              };
            }
          }),
        } as any,
        'incidentId-123'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams({});

    const incidentsStream = streams[1];
    const incidentsIter = incidentsStream.readRecords(SyncMode.FULL_REFRESH);
    const incidents = [];
    for await (const incident of incidentsIter) {
      incidents.push(incident);
    }

    expect(fnIncidentsFunc).toHaveBeenCalledTimes(1);
    expect(incidents).toStrictEqual(readTestResourceFile('incidents.json'));
  });

  test('streams - services, use full_refresh sync mode', async () => {
    const fnServicesFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnServicesFunc.mockResolvedValue({
            data: {data: readTestResourceFile('services.json')},
          }),
        } as any,
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams({});

    const servicesStream = streams[2];
    const servicesIter = servicesStream.readRecords(SyncMode.FULL_REFRESH);
    const services = [];
    for await (const service of servicesIter) {
      services.push(service);
    }

    expect(fnServicesFunc).toHaveBeenCalledTimes(1);
    expect(services).toStrictEqual(readTestResourceFile('services.json'));
  });

  test('streams - users, use full_refresh sync mode', async () => {
    const fnUsersFunc = jest.fn();

    Squadcast.instance = jest.fn().mockImplementation(() => {
      return new Squadcast(
        {
          get: fnUsersFunc.mockResolvedValue({
            data: {data: readTestResourceFile('users.json')},
          }),
        } as any,
        'incidentId'
      );
    });
    const source = new sut.SquadcastSource(logger);
    const streams = source.streams({});

    const usersStream = streams[3];
    const usersIter = usersStream.readRecords(SyncMode.FULL_REFRESH);
    const users = [];
    for await (const user of usersIter) {
      users.push(user);
    }

    expect(fnUsersFunc).toHaveBeenCalledTimes(1);
    expect(users).toStrictEqual(readTestResourceFile('users.json'));
  });
});
