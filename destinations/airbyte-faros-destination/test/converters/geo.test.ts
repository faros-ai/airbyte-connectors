import {FarosClient} from 'faros-js-client';
import {getLocal} from 'mockttp';

import {LocationCollector} from '../../src/converters/common/geo';

describe('LocationCollector', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});

  const geocodeResponse = [
    {
      uid: 'Brooklyn, New York',
      raw: 'Brooklyn, New York',
      address: {
        uid: 'ChIJCSF8lBZEwokRhngABHRcdoI',
        fullAddress: 'Brooklyn, NY, USA',
        city: 'Brooklyn',
        state: 'New York',
        stateCode: 'NY',
        country: 'United States',
        countryCode: 'US',
      },
      coordinates: {
        lat: 40.6781784,
        lon: -73.9441579,
      },
      room: null,
    },
  ];

  beforeEach(async () => {
    await mockttp.start();
  });

  afterEach(async () => {
    await mockttp.stop();
  });

  test('returns null for empty location', async () => {
    const farosClient = new FarosClient({
      url: 'http://localhost:8000',
      apiKey: 'test-key',
    });

    const collector = new LocationCollector(false, farosClient);
    expect(await collector.collect()).toBeNull();
    expect(await collector.collect('')).toBeNull();
    expect(await collector.collect('  ')).toBeNull();
    expect(collector.convertLocations()).toEqual([]);
  });

  test('caches and returns uncoded locations', async () => {
    const collector = new LocationCollector(false, undefined);
    const location = 'New York, NY';
    const result = await collector.collect(location);
    expect(result).toEqual({uid: location});
    expect(collector.convertLocations()).toMatchSnapshot();
  });

  test('caches and returns previously seen locations', async () => {
    const collector = new LocationCollector(false, undefined);
    const location = 'New York, NY';

    const result1 = await collector.collect(location);
    const result2 = await collector.collect(location);

    expect(result1).toEqual(result2);
    expect(result1).toEqual({uid: location});
    expect(collector.convertLocations()).toMatchSnapshot();
  });

  test('geocodes locations with FarosClient', async () => {
    const farosClient = new FarosClient({
      url: mockttp.url,
      apiKey: 'test-key',
    });

    await mockttp
      .forPost('/geocoding/lookup')
      .once() // Should call FarosClient once for same location
      .thenReply(200, JSON.stringify({locations: geocodeResponse}));

    const collector = new LocationCollector(true, farosClient);
    const result1 = await collector.collect('Brooklyn, New York');
    const result2 = await collector.collect('Brooklyn, New York');

    expect(result1).toEqual(result2);
    expect(result1).toEqual({uid: 'Brooklyn, New York'});
    expect(collector.convertLocations()).toMatchSnapshot();
  });

  test('handles invalid geocoding response with uncoded location', async () => {
    await mockttp
      .forPost('/geocoding/lookup')
      .thenReply(200, JSON.stringify({locations: [{id: 'some-id'}]}));

    const farosClient = new FarosClient({
      url: mockttp.url,
      apiKey: 'test-key',
    });

    const collector = new LocationCollector(true, farosClient);
    const location = 'San Francisco, CA';
    const result = await collector.collect(location);

    expect(result).toEqual({uid: location});
    expect(collector.convertLocations()).toMatchSnapshot();
  });

  test('deduplicates identical addresses and coordinates', async () => {
    const farosClient = new FarosClient({
      url: mockttp.url,
      apiKey: 'test-key',
    });
    const collector = new LocationCollector(true, farosClient);

    await mockttp
      .forPost('/geocoding/lookup')
      .withJsonBody({locations: ['Brooklyn, NY']})
      .once()
      .thenReply(200, JSON.stringify({locations: geocodeResponse}));

    await mockttp
      .forPost('/geocoding/lookup')
      .withJsonBody({locations: ['Brooklyn, New York, NY, USA']})
      .once()
      .thenReply(
        200,
        JSON.stringify({
          locations: [
            {
              ...geocodeResponse[0],
              uid: 'Brooklyn, New York, NY, USA',
              raw: 'Brooklyn, New York, NY, USA',
              coordinates: {
                lat: '40.6781784',
                lon: '-73.9441579',
              },
            },
          ],
        })
      );

    await collector.collect('Brooklyn, NY');
    await collector.collect('Brooklyn, New York, NY, USA');

    expect(collector.convertLocations()).toMatchSnapshot();
  });
});
