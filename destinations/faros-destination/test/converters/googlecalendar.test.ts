import {AirbyteLog, AirbyteLogLevel} from 'faros-airbyte-cdk';
import fs from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import pino from 'pino';

import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {googlecalendarAllStreamsLog} from './data';

describe('googlecalendar', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/googlecalendar/catalog.json';
  let configPath: string;
  const streamNamePrefix = 'mytestsource__googlecalendar__';

  beforeEach(async () => {
    const locationsRes = [
      {
        uid: '419 University Ave, Palo Alto, CA 94301',
        raw: '419 University Ave, Palo Alto, CA 94301',
        address: {
          // eslint-disable-next-line max-len
          uid: 'EjI0MjAgVW5pdmVyc2l0eSBBdmUgIzMzM2EsIFBhbG8gQWx0bywgQ0EgOTQzMDEsIFVTQSIgGh4KFgoUChIJJy30Azm7j4ARbLmzlBtnYb8SBDMzM2E',
          fullAddress: '420 University Ave #333a, Palo Alto, CA 94301, USA',
          street: 'University Avenue',
          houseNumber: '420',
          unit: '333a',
          postalCode: '94301',
          city: 'Palo Alto',
          state: 'California',
          stateCode: 'CA',
          country: 'United States',
          countryCode: 'US',
        },
        coordinates: {lat: 37.4471709, lon: -122.1599896},
      },
    ];

    await mockttp.start({startPort: 30000, endPort: 50000});
    mockttp
      .forPost('/geocoding/lookup')
      .thenReply(200, JSON.stringify({locations: locationsRes}));
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(googlecalendarAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {calendars: 1, events: 3};
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cal_Calendar: 1,
      cal_Event: 3,
      cal_EventGuestAssociation: 2,
      cal_User: 5,
      geo_Address: 2,
      geo_Coordinates: 2,
      geo_Location: 2,
    };

    const processedTotal = _(processedByStream).values().sum();
    const writtenTotal = _(writtenByModel).values().sum();
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });
});
