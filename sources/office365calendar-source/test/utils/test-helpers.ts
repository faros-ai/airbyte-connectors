import { AirbyteLogger } from 'faros-airbyte-cdk';
import { AxiosInstance, AxiosResponse } from 'axios';
import { Office365Calendar, Office365CalendarConfig } from '../../src/office365calendar';
import { Calendar, Event } from '../../src/models';

/**
 * Creates a mock AirbyteLogger for testing.
 * This eliminates the duplication of logger setup across 12+ test files.
 */
export function createMockLogger(): jest.Mocked<AirbyteLogger> {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<AirbyteLogger>;
}

/**
 * Creates a test configuration with sensible defaults.
 * Reduces duplication of config objects across test files.
 */
export function createTestConfig(overrides: Partial<Office365CalendarConfig> = {}): Office365CalendarConfig {
  return {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    tenant_id: 'test-tenant-id',
    ...overrides
  };
}

/**
 * Creates a mock Office365Calendar instance for testing.
 * Eliminates duplication of mock calendar setup.
 */
export function createMockOffice365Calendar(): jest.Mocked<Office365Calendar> {
  return {
    getCalendars: jest.fn(),
    getUsers: jest.fn(),
    checkConnection: jest.fn(),
    getEvents: jest.fn(),
    getEventsIncremental: jest.fn(),
  } as unknown as jest.Mocked<Office365Calendar>;
}

/**
 * Creates a mock HTTP client for axios testing.
 * Reduces duplication of HTTP client mocking.
 */
export function createMockHttpClient(): jest.Mocked<AxiosInstance> {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    head: jest.fn(),
    options: jest.fn(),
    patch: jest.fn(),
    request: jest.fn(),
    defaults: {} as any,
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    } as any,
    getUri: jest.fn(),
  } as unknown as jest.Mocked<AxiosInstance>;
}

/**
 * Creates a successful token response for auth testing.
 * Eliminates duplication of token response mocking.
 */
export function createTokenResponse(overrides: Partial<any> = {}): AxiosResponse {
  return {
    data: {
      access_token: 'test-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://graph.microsoft.com/Calendars.Read',
      ...overrides
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any
  } as AxiosResponse;
}

/**
 * Sets up common test environment for stream tests.
 * Eliminates duplication of beforeEach blocks across stream tests.
 */
export interface StreamTestSetup {
  mockLogger: jest.Mocked<AirbyteLogger>;
  validConfig: Office365CalendarConfig;
  mockOffice365Calendar: jest.Mocked<Office365Calendar>;
}

export function setupStreamTests(): StreamTestSetup {
  jest.clearAllMocks();
  
  // Reset singleton between tests
  (Office365Calendar as any).office365Calendar = null;
  
  const mockLogger = createMockLogger();
  const validConfig = createTestConfig();
  const mockOffice365Calendar = createMockOffice365Calendar();

  return {
    mockLogger,
    validConfig,
    mockOffice365Calendar
  };
}

/**
 * Creates a mock calendar object for testing.
 * Reduces duplication of calendar mock data.
 */
export function createMockCalendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'calendar-1',
    uid: 'calendar-1',
    name: 'Primary Calendar',
    summary: 'Primary Calendar',
    description: 'My main calendar',
    time_zone: 'UTC',
    access_role: 'owner',
    primary: true,
    owner: {
      name: 'John Doe',
      address: 'john@example.com',
      email: 'john@example.com'
    },
    canEdit: true,
    canShare: true,
    canViewPrivateItems: false,
    source: 'office365',
    ...overrides
  };
}

/**
 * Creates a mock event object for testing.
 * Reduces duplication of event mock data.
 */
export function createMockEvent(overrides: Partial<Event> = {}): Event {
  const baseEvent: Event = {
    id: 'event-1',
    uid: 'event-1',
    calendarUid: 'calendar-1',
    subject: 'Test Meeting',
    summary: 'Test Meeting',
    title: 'Test Meeting',
    description: 'A test meeting',
    location: 'Conference Room A',
    body: {
      contentType: 'text',
      content: 'Meeting description'
    },
    start: {
      date: '2024-01-15',
      dateTime: '2024-01-15T10:00:00Z',
      date_time: '2024-01-15T10:00:00Z',
      timeZone: 'UTC',
      time_zone: 'UTC'
    },
    end: {
      date: '2024-01-15',
      dateTime: '2024-01-15T11:00:00Z',
      date_time: '2024-01-15T11:00:00Z',
      timeZone: 'UTC',
      time_zone: 'UTC'
    },
    startTime: '2024-01-15T10:00:00Z',
    endTime: '2024-01-15T11:00:00Z',
    isAllDay: false,
    attendees: [],
    organizer: {
      email: 'organizer@example.com',
      display_name: 'Event Organizer',
      name: 'Event Organizer',
      emailAddress: {
        name: 'Event Organizer',
        address: 'organizer@example.com'
      }
    },
    webLink: 'https://outlook.com/event-1',
    meetingUrl: 'https://teams.microsoft.com/meeting',
    categories: [],
    status: 'confirmed',
    showAs: 'busy',
    isCancelled: false,
    importance: 'normal',
    sensitivity: 'normal',
    createdAt: '2024-01-12T14:30:00Z',
    updatedAt: '2024-01-12T14:30:00Z',
    createdDateTime: '2024-01-12T14:30:00Z',
    lastModifiedDateTime: '2024-01-12T14:30:00Z',
    source: 'office365',
    visibility: 'default',
    created: '2024-01-12T14:30:00Z',
    updated: '2024-01-12T14:30:00Z',
    creator: {
      email: 'creator@example.com',
      display_name: 'Event Creator'
    },
    ...overrides
  };
  
  return baseEvent;
}

/**
 * Common assertion helpers for result objects.
 * Reduces duplication of success/error checking.
 */
export function expectSuccessResult<T>(result: { success: boolean; data?: T; error?: any }): void {
  expect(result.success).toBe(true);
  expect(result.data).toBeDefined();
  expect(result.error).toBeUndefined();
}

export function expectErrorResult<T>(result: { success: boolean; data?: T; error?: any }, expectedMessage?: string): void {
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.data).toBeUndefined();
  
  if (expectedMessage) {
    expect(result.error.message).toContain(expectedMessage);
  }
}

/**
 * Helper for common VError assertions.
 * Reduces duplication of error testing patterns.
 */
export async function expectVError(promiseFn: () => Promise<any>, expectedMessage?: string): Promise<void> {
  await expect(promiseFn()).rejects.toThrow();
  
  if (expectedMessage) {
    await expect(promiseFn()).rejects.toThrow(expectedMessage);
  }
}

/**
 * Creates array of mock calendars for pagination testing.
 */
export function createMockCalendars(count: number): Calendar[] {
  return Array.from({ length: count }, (_, i) => createMockCalendar({
    id: `calendar-${i + 1}`,
    uid: `calendar-${i + 1}`,
    name: `Calendar ${i + 1}`,
    summary: `Calendar ${i + 1}`
  }));
}

/**
 * Creates array of mock events for pagination testing.
 */
export function createMockEvents(count: number, calendarId: string = 'calendar-1'): Event[] {
  return Array.from({ length: count }, (_, i) => createMockEvent({
    id: `event-${i + 1}`,
    uid: `event-${i + 1}`,
    calendarUid: calendarId,
    subject: `Event ${i + 1}`,
    summary: `Event ${i + 1}`,
    title: `Event ${i + 1}`
  }));
}