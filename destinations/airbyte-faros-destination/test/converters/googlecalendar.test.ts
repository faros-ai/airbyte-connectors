import {initMockttp, tempConfig} from 'faros-airbyte-testing-tools';
import {destinationWriteTest} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

describe('googlecalendar', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

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
    configPath = await tempConfig({api_url: mockttp.url, log_records: true});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/googlecalendar/catalog.json',
      inputRecordsPath: 'googlecalendar/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
