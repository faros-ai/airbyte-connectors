import {
  destinationWriteTest,
  initMockttp,
  tempConfig,
} from 'faros-airbyte-testing-tools';
import {getLocal} from 'mockttp';

describe('office365calendar', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    // Mock location resolution for office addresses and conference rooms
    const locationsRes = [
      {
        uid: 'Conference Room A, Building 1',
        raw: 'Conference Room A, Building 1',
        address: {
          uid: 'ConferenceRoomA-Building1-Address',
          fullAddress: 'Conference Room A, Building 1, 123 Business Ave, San Francisco, CA 94102, USA',
          street: 'Business Avenue',
          houseNumber: '123',
          unit: 'Conference Room A',
          postalCode: '94102',
          city: 'San Francisco',
          state: 'California',
          stateCode: 'CA',
          country: 'United States',
          countryCode: 'US',
        },
        coordinates: {lat: 37.7849, lon: -122.4094},
      },
      {
        uid: 'Executive Conference Room, 42nd Floor, Building A',
        raw: 'Executive Conference Room, 42nd Floor, Building A',
        address: {
          uid: 'ExecutiveRoom-Building A-Address',
          fullAddress: 'Executive Conference Room, 42nd Floor, Building A, 456 Corporate Plaza, New York, NY 10001, USA',
          street: 'Corporate Plaza',
          houseNumber: '456',
          unit: 'Executive Conference Room, 42nd Floor',
          postalCode: '10001',
          city: 'New York',
          state: 'New York',
          stateCode: 'NY',
          country: 'United States',
          countryCode: 'US',
        },
        coordinates: {lat: 40.7489, lon: -73.9857},
      },
    ];

    await initMockttp(mockttp);
    mockttp
      .forPost('/geocoding/lookup')
      .thenReply(200, JSON.stringify({locations: locationsRes}));
    
    // Mock GraphQL introspection query for JSONataConverter fallback
    await mockttp
      .forPost('/graphs/test-graph/graphql')
      .withQuery({ phantoms: 'include-nested-only' })
      .thenReply(
        200,
        JSON.stringify({
          data: {
            __schema: {
              queryType: { name: 'Query', kind: 'OBJECT' },
              mutationType: { name: 'Mutation', kind: 'OBJECT' },
              subscriptionType: null,
              types: [],
              directives: []
            }
          }
        })
      );
    
    configPath = await tempConfig({api_url: mockttp.url, log_records: true});
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/office365calendar/catalog.json',
      inputRecordsPath: 'office365calendar/all-streams.log',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});