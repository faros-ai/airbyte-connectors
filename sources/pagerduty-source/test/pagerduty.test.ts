import {AirbyteLogLevel, AirbyteSourceLogger} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import * as sut from '../src/pagerduty';
import {Incident, LogEntry, PagerdutyResponse} from '../src/pagerduty';

describe('Pagerduty', () => {
  const logger = new AirbyteSourceLogger(
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

  test('Handles 10000 pagination limit error - 1', async () => {
    const pd = new sut.Pagerduty(mockApi, logger);

    const logEntry: LogEntry = {
      id: 'id',
      type: 'LogEntry',
      summary: 'Summary',
      self: 'self',
      html_url: 'url',
      created_at: new Date().toISOString(),
      incident: {
        id: 'id',
        type: 'Incident',
        summary: 'Summary',
        self: 'self',
        html_url: 'url',
      },
      service: {
        id: 'id',
        type: 'Service',
        summary: 'Summary',
        self: 'self',
        html_url: 'url',
      },
      agent: {
        id: 'id',
        type: 'Agent',
        summary: 'Summary',
        self: 'self',
        html_url: 'url',
      },
    };

    const response = pagination10000Response<LogEntry>(
      'Invalid Input Provided',
      ['Offset must be less than 10001.'],
      logEntry
    );

    mockGet.mockResolvedValue(response);

    const iter = pd.getIncidentLogEntries(
      DateTime.now().minus({hours: 12}),
      DateTime.now()
    );
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(items).toEqual([logEntry]);
  });

  test('Handles 10000 pagination limit error - 2', async () => {
    const pd = new sut.Pagerduty(mockApi, logger);

    const incidentEntry: Incident = {
      id: 'id',
      type: 'Incident',
      description: 'description',
      status: 'acknowledged',
      acknowledgements: [],
      incident_key: '',
      urgency: 'high',
      title: 'title',
      service: {
        id: 'id',
        type: 'Service',
        summary: 'Summary',
        self: 'self',
        html_url: 'url',
      },
      assignments: [],
      last_status_change_at: '',
      summary: 'Summary',
      self: 'self',
      html_url: 'url',
      created_at: '2021-10-29T05:52:30.000Z',
      updated_at: '2021-10-29T05:52:30.000Z',
      resolved_at: '2021-10-29T05:52:30.000Z',
    };

    const response = pagination10000Response<Incident>(
      'Arguments Caused Error',
      [
        'Offset+limit exceeds maximum allowed value of 10000. Please try to refine your search to reduce the returned set of records below this number, like adding a date range.',
      ],
      incidentEntry
    );

    mockGet.mockResolvedValue(response);

    const iter = pd.getIncidents(
      DateTime.now().minus({hours: 12}),
      DateTime.now()
    );
    const items = [];
    for await (const item of iter) {
      items.push(item);
    }

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(items).toEqual([incidentEntry]);
  });
});

function pagination10000Response<T>(
  message: string,
  errors: string[],
  item: T
): PagerdutyResponse<T> {
  const limitExceededResponse: PagerdutyResponse<T> = {
    url: 'url',
    status: 400,
    statusText: 'Bad Request',
    data: {
      error: {
        message,
        code: 2001,
        errors,
      },
    },
    resource: [],
  };
  const successResponse: PagerdutyResponse<T> = {
    url: 'url',
    status: 200,
    statusText: 'OK',
    data: {},
    resource: [item],
    next: (): Promise<PagerdutyResponse<T>> =>
      Promise.resolve(limitExceededResponse),
  };

  return successResponse;
}
