import {AirbyteLogger, AirbyteLogLevel} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import * as sut from '../src/pagerduty';
import {LogEntry, PagerdutyResponse} from '../src/pagerduty';

describe('Pagerduty', () => {
  const logger = new AirbyteLogger(
    // Shush messages in tests, unless in debug
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const mockGet = jest.fn();
  const mockApi = {
    get: mockGet,
  } as any;

  afterEach(() => {
    mockGet.mockReset();
  });

  test('Handles 10000 pagination limit error', async () => {
    const pd = new sut.Pagerduty(mockApi, logger);

    const limitExceededResponse: PagerdutyResponse<LogEntry> = {
      url: 'url',
      status: 400,
      statusText: 'Bad Request',
      data: {
        error: {
          message: 'Invalid Input Provided',
          code: 2001,
          errors: ['Offset must be less than 10001.'],
        },
      },
      resource: [],
    };
    const logEntry = {
      id: 'id',
      type: 'LogEntry',
      summary: 'Summary',
      self: 'self',
      html_url: 'url',
      created_at: '1',
      incident: {
        id: 'id',
        type: 'Incident',
        summary: 'Summary',
        self: 'self',
        html_url: 'url',
        created_at: '1',
      },
      service: {
        id: 'id',
        type: 'Service',
        summary: 'Summary',
        self: 'self',
        html_url: 'url',
        created_at: '1',
      },
    };
    const successResponse: PagerdutyResponse<LogEntry> = {
      url: 'url',
      status: 200,
      statusText: 'OK',
      data: {
        log_entries: [
          {
            id: 'id',
            type: 'trigger_log_entry',
          },
        ],
      },
      resource: [logEntry],
      next: (): Promise<PagerdutyResponse<LogEntry>> =>
        Promise.reject(limitExceededResponse),
    };

    mockGet.mockResolvedValue(successResponse);

    const iter = pd.getIncidentLogEntries(DateTime.now(), DateTime.now());
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(mockGet).toBeCalledTimes(1);
    expect(items).toEqual([logEntry]);
  });
});
