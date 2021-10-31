import AxiosMock from 'axios-mock-adapter';
import {
  AirbyteLogger,
  AirbyteLogLevel,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk/lib';
import fs from 'fs';
import {VError} from 'verror';

import {CustomerIOSource} from '../src';

function readTestResourceFile(fileName: string): any {
  return JSON.parse(fs.readFileSync(`test_files/${fileName}`, 'utf8'));
}

describe('index', () => {
  let source: CustomerIOSource;
  let axiosMock: AxiosMock;

  beforeEach(() => {
    const logger = new AirbyteLogger(
      // Shush messages in tests, unless in debug
      process.env.LOG_LEVEL === 'debug'
        ? AirbyteLogLevel.DEBUG
        : AirbyteLogLevel.FATAL
    );

    source = new CustomerIOSource(logger);
    axiosMock = new AxiosMock(source.axios);
  });

  describe('spec', () => {
    it('matches the spec', async () => {
      await expect(source.spec()).resolves.toStrictEqual(
        new AirbyteSpec(readTestResourceFile('spec.json'))
      );
    });
  });

  describe('checkConnection', () => {
    it('succeeds if it can make an api call', async () => {
      axiosMock.onGet('/campaigns').reply(200);

      await expect(
        source.checkConnection({
          app_api_key: 'testkey',
        })
      ).resolves.toStrictEqual([true, undefined]);
    });

    it('fails if the token is invalid', async () => {
      axiosMock.onGet('/campaigns').reply(401);

      await expect(
        source.checkConnection({
          app_api_key: 'invalid',
        })
      ).resolves.toStrictEqual([
        false,
        new VError(
          'Customer.io authorization failed. Try changing your app api token'
        ),
      ]);
    });
  });

  describe('streams', () => {
    describe('campaigns', () => {
      it('yields all campaigns', async () => {
        const apiCampaigns = [
          {
            id: 1,
          },
          {
            id: 2,
          },
        ];

        axiosMock.onGet('/campaigns').reply(200, {campaigns: apiCampaigns});

        const [campaignsStream] = source.streams({
          app_api_key: 'testkey',
        });

        const campaignsIterator = campaignsStream.readRecords(
          SyncMode.FULL_REFRESH
        );

        const campaigns: any[] = [];

        for await (const campaign of campaignsIterator) {
          campaigns.push(campaign);
        }

        expect(campaigns).toEqual(apiCampaigns);
      });
    });
  });
});
