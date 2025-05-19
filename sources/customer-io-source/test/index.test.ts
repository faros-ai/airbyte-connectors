import axios from 'axios';
import AxiosMock from 'axios-mock-adapter';
import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  AirbyteSpec,
  SyncMode,
} from 'faros-airbyte-cdk';
import {readResourceFile} from 'faros-airbyte-common/common';
import fs from 'fs';
import {VError} from 'verror';

import {CustomerIOSource} from '../src';

describe('index', () => {
  let source: CustomerIOSource;
  let axiosMock: AxiosMock;

  beforeEach(() => {
    const logger = new AirbyteSourceLogger(
      // Shush messages in tests, unless in debug
      process.env.LOG_LEVEL === 'debug'
        ? AirbyteLogLevel.DEBUG
        : AirbyteLogLevel.FATAL
    );

    const axiosInstance = axios.create();

    source = new CustomerIOSource(logger, axiosInstance);
    axiosMock = new AxiosMock(axiosInstance);
  });

  describe('spec', () => {
    it('matches the spec', async () => {
      await expect(source.spec()).resolves.toStrictEqual(
        new AirbyteSpec(readResourceFile('spec.json'))
      );
    });
  });

  describe('checkConnection', () => {
    it('succeeds if it can make an api call', async () => {
      axiosMock.onGet('/campaigns').reply(200);

      await expect(
        source.checkConnection({
          app_api_key: 'testkey',
          cutoff_days: 90,
        })
      ).resolves.toStrictEqual([true, undefined]);
    });

    it('fails if the token is invalid', async () => {
      axiosMock.onGet('/campaigns').reply(401);

      await expect(
        source.checkConnection({
          app_api_key: 'testkey',
          cutoff_days: 90,
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
            updated: 1649322500663,
          },
          {
            id: 2,
            updated: 1649322500663,
          },
        ];

        axiosMock.onGet('/campaigns').reply(200, {campaigns: apiCampaigns});

        const [campaignsStream] = source.streams({
          app_api_key: 'testkey',
          cutoff_days: 90,
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

    describe('campaign actions', () => {
      it('yields all campaign actions', async () => {
        axiosMock.onGet('/campaigns').replyOnce(200, {
          campaigns: [
            {
              id: 1,
            },
            {
              id: 2,
              actions: [{}, {}, {}],
            },
            {
              id: 3,
              actions: [{}, {}],
            },
          ],
        });

        axiosMock.onGet('/campaigns/2/actions').replyOnce(200, {
          next: 'abcd',
          actions: [
            {
              id: '1',
              updated: 1649322500663,
            },
            {
              id: '2',
              updated: 1649322500663,
            },
          ],
        });

        axiosMock
          .onGet('/campaigns/2/actions', {
            params: {
              start: 'abcd',
            },
          })
          .replyOnce(200, {
            next: 'bcde',
            actions: [
              {
                id: '3',
                updated: 1649322500663,
              },
            ],
          });

        axiosMock
          .onGet('/campaigns/2/actions', {
            params: {
              start: 'bcde',
            },
          })
          .replyOnce(200, {
            next: '',
            actions: [],
          });

        axiosMock.onGet('/campaigns/3/actions').replyOnce(200, {
          next: 'cdef',
          actions: [
            {
              id: '4',
              updated: 1649322500663,
            },
            {
              id: '5',
              updated: 1649322500663,
            },
          ],
        });

        axiosMock
          .onGet('/campaigns/3/actions', {
            params: {
              start: 'cdef',
            },
          })
          .replyOnce(200, {
            next: '',
            actions: [],
          });

        const [, campaignActionsStream] = source.streams({
          app_api_key: 'testkey',
          cutoff_days: 90,
        });

        const campaignActionsIterator = campaignActionsStream.readRecords(
          SyncMode.FULL_REFRESH
        );

        const campaignActions: any[] = [];

        for await (const campaign of campaignActionsIterator) {
          campaignActions.push(campaign);
        }

        expect(campaignActions).toEqual([
          {id: '1', updated: 1649322500663},
          {id: '2', updated: 1649322500663},
          {id: '3', updated: 1649322500663},
          {id: '4', updated: 1649322500663},
          {id: '5', updated: 1649322500663},
        ]);
      });
    });

    describe('newsletters', () => {
      it('yields all newsletters', async () => {
        const apiNewsletters = [
          {
            id: 1,
            updated: 1649322500663,
          },
          {
            id: 2,
            updated: 1649322500663,
          },
        ];

        axiosMock
          .onGet('/newsletters')
          .reply(200, {newsletters: apiNewsletters});

        const [, , newslettersStream] = source.streams({
          app_api_key: 'testkey',
          cutoff_days: 90,
        });

        const newslettersIterator = newslettersStream.readRecords(
          SyncMode.FULL_REFRESH
        );

        const newsletters: any[] = [];

        for await (const newsletter of newslettersIterator) {
          newsletters.push(newsletter);
        }

        expect(newsletters).toEqual(apiNewsletters);
      });
    });
  });
});
