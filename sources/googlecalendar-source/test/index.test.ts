import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import fs from 'fs-extra';
import {VError} from 'verror';

import {Event, Googlecalendar} from '../src/googlecalendar';
import * as sut from '../src/index';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

const locationData = readTestResourceFile('location.data.json');

describe('index', () => {
  const logger = new AirbyteLogger(
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
    const source = new sut.GooglecalendarSource(logger);
    await expect(source.spec()).resolves.toStrictEqual(
      new AirbyteSpec(readTestResourceFile('spec.json'))
    );
  });

  test('check connection', async () => {
    Googlecalendar.instance = jest.fn().mockImplementation(() => {
      return new Googlecalendar(
        {calendarList: {list: jest.fn().mockResolvedValue({})}} as any,
        'primary',
        {events: 100, calendars: 100},
        {geocode: jest.fn().mockResolvedValue([{}])} as any,
        logger
      );
    });

    const source = new sut.GooglecalendarSource(logger);
    await expect(
      source.checkConnection({
        private_key: 'key',
        client_email: 'email',
      })
    ).resolves.toStrictEqual([true, undefined]);
  });

  test('check connection - incorrect config', async () => {
    Googlecalendar.instance = jest.fn().mockImplementation(() => {
      return new Googlecalendar(
        {calendarList: {list: jest.fn().mockRejectedValue('some text')}} as any,
        'primary',
        {events: 100, calendars: 100},
        {geocode: jest.fn().mockResolvedValue([{}])} as any,
        logger
      );
    });
    const source = new sut.GooglecalendarSource(logger);
    await expect(
      source.checkConnection({
        private_key: 'key',
        client_email: 'email',
      })
    ).resolves.toStrictEqual([
      false,
      new VError(
        'Please verify your private_key and client_email are correct. Error: err must be an Error'
      ),
    ]);
  });

  test('streams - calendars, use full_refresh sync mode', async () => {
    const calendarsList = jest.fn();

    Googlecalendar.instance = jest.fn().mockImplementation(() => {
      return new Googlecalendar(
        {
          calendarList: {
            list: calendarsList.mockResolvedValue({
              data: readTestResourceFile('calendars.json'),
            }),
          },
        } as any,
        'primary',
        {events: 100, calendars: 100},
        {geocode: jest.fn().mockResolvedValue([])} as any,
        logger
      );
    });
    const source = new sut.GooglecalendarSource(logger);
    const streams = source.streams({
      private_key: 'key',
      client_email: 'email',
    });

    const calendarsStream = streams[0];
    const calendarsIter = calendarsStream.readRecords(SyncMode.FULL_REFRESH);
    const calendars = [];
    for await (const calendarEntry of calendarsIter) {
      calendars.push(calendarEntry);
    }
    expect(calendarsList).toHaveBeenCalledTimes(1);
    expect(calendars).toStrictEqual(
      readTestResourceFile('calendars.json').items.map((c) => ({
        ...c,
        nextSyncToken: 'sync-token',
      }))
    );
  });

  test('streams - events, use full_refresh sync mode', async () => {
    const eventsList = jest.fn();

    Googlecalendar.instance = jest.fn().mockImplementation(() => {
      return new Googlecalendar(
        {
          events: {
            list: eventsList.mockResolvedValue({
              data: readTestResourceFile('events.json'),
            }),
          },
        } as any,
        'primary',
        {events: 100, calendars: 100},
        {geocode: jest.fn().mockResolvedValue([locationData])} as any,
        logger
      );
    });
    const source = new sut.GooglecalendarSource(logger);
    const streams = source.streams({
      private_key: 'key',
      client_email: 'email',
    });

    const eventsStream = streams[1];
    const eventsIter = eventsStream.readRecords(SyncMode.FULL_REFRESH);
    const events = [];
    for await (const event of eventsIter) {
      events.push(event);
    }
    expect(eventsList).toHaveBeenCalledTimes(1);
    expect(events).toStrictEqual(
      readTestResourceFile('events.json').items.map((c) => {
        const res = {
          ...c,
          nextSyncToken: 'sync-token-events',
        };
        if (c.location) {
          res.location_geocode = locationData;
        }
        return res;
      })
    );
  });

  test('streams - events, use incremental sync mode', async () => {
    const eventsList = jest.fn();

    Googlecalendar.instance = jest.fn().mockImplementation(() => {
      return new Googlecalendar(
        {
          events: {
            list: eventsList.mockImplementation(
              async ({updatedMin}: {updatedMin?: string}) => {
                const file = readTestResourceFile('events.json');
                const items = file.items.filter(
                  (e: Event) => new Date(e.updated) > new Date(updatedMin)
                );
                return {data: {...file, items}};
              }
            ),
          },
        } as any,
        'primary',
        {events: 100, calendars: 100},
        {geocode: jest.fn().mockResolvedValue([locationData])} as any,
        logger
      );
    });
    const source = new sut.GooglecalendarSource(logger);
    const streams = source.streams({
      private_key: 'key',
      client_email: 'email',
    });

    const eventsStream = streams[1];
    const eventsIter = eventsStream.readRecords(
      SyncMode.INCREMENTAL,
      undefined,
      undefined,
      {
        cutoff: '2021-12-31T00:00:00',
      }
    );
    const events = [];
    for await (const event of eventsIter) {
      events.push(event);
    }
    expect(eventsList).toHaveBeenCalledTimes(1);
    expect(events).toStrictEqual([]);
  });
});
