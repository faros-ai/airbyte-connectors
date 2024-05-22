import {getLocal} from 'mockttp';

import {initMockttp, tempConfig} from '../testing-tools';
import {googlecalendarAllStreamsLog} from './data';
import {destinationWriteTest} from './utils';

describe('googlecalendar', () => {
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

    await initMockttp(mockttp);
    mockttp
      .forPost('/geocoding/lookup')
      .thenReply(200, JSON.stringify({locations: locationsRes}));
    configPath = await tempConfig({api_url: mockttp.url});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    const expectedProcessedByStream = {calendars: 1, events: 3};
    const expectedWrittenByModel = {
      cal_Calendar: 1,
      cal_Event: 3,
      cal_EventGuestAssociation: 2,
      cal_User: 2,
      geo_Address: 2,
      geo_Coordinates: 2,
      geo_Location: 2,
    };

    await destinationWriteTest({
      configPath,
      catalogPath,
      streamsLog: googlecalendarAllStreamsLog,
      streamNamePrefix,
      expectedProcessedByStream,
      expectedWrittenByModel,
    });
  });
});
