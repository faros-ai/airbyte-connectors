import {initMockttp, tempConfig} from 'faros-airbyte-testing-tools';
import {destinationWriteTest} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

describe('azureactivedirectory', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});

  beforeEach(async () => {
    const locationsRes = {
      locations: [
        {
          uid: '32 dai tu, ha noi',
          raw: '32 dai tu, ha noi',
          address: {
            uid: 'ChIJR5Y1ZV2sNTERqsubxtBiOJ8',
            fullAddress: '32 P. Đại Từ, Đại Kim, Hoàng Mai, Hà Nội, Vietnam',
            street: 'Phố Đại Từ',
            houseNumber: '32',
            unit: null,
            postalCode: null,
            city: 'Hoàng Mai',
            state: 'Hà Nội',
            stateCode: 'Hà Nội',
            country: 'Vietnam',
            countryCode: 'VN',
          },
          coordinates: {
            lat: 20.9847782,
            lon: 105.8385857,
          },
          room: null,
        },
      ],
    };

    await initMockttp(mockttp);
    mockttp
      .forPost('/geocoding/lookup')
      .once()
      .thenReply(200, JSON.stringify(locationsRes));
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath: await tempConfig({api_url: mockttp.url, log_records: true}),
      catalogPath: 'test/resources/azureactivedirectory/catalog.json',
      inputRecordsPath: 'azureactivedirectory/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });

  test('process records from all streams - geocoded', async () => {
    const configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
      source_specific_configs: {
        azureactivedirectory: {resolve_locations: true},
      },
    });
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/azureactivedirectory/catalog.json',
      inputRecordsPath: 'azureactivedirectory/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});
