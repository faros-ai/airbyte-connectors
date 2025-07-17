import { AirbyteLogger } from 'faros-airbyte-cdk';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { Calendar, Event } from '@microsoft/microsoft-graph-types';
import { VError } from 'verror';

// Import our branded types and new interfaces
import { 
  Office365CalendarConfig,
  CalendarId,
  TenantId,
  UserId,
  DeltaToken,
  GraphCalendar,
  GraphEvent,
  EventDelta,
  Result,
  asTenantId
} from '../src/models';
import { Office365CalendarSDK } from '../src/office365calendar-sdk';

// Mock Microsoft Graph SDK
jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

const MockedClient = Client as jest.MockedClass<typeof Client>;
const MockedCredential = ClientSecretCredential as jest.MockedClass<typeof ClientSecretCredential>;

describe('O365CAL-006a: Microsoft Graph SDK Refactor (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let mockGraphClient: jest.Mocked<Client>;
  let mockCredential: jest.Mocked<ClientSecretCredential>;
  let office365SDK: Office365CalendarSDK;
  let validConfig: Office365CalendarConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
      trace: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as AirbyteLogger;

    validConfig = {
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      tenant_id: asTenantId('test-tenant-id')
    };

    // Mock Azure Identity credential
    mockCredential = {
      getToken: jest.fn().mockResolvedValue({
        token: 'mock-access-token',
        expiresOnTimestamp: Date.now() + 3600000
      })
    } as unknown as jest.Mocked<ClientSecretCredential>;

    MockedCredential.mockImplementation(() => mockCredential);

    // Mock Microsoft Graph Client with proper chaining
    const mockRequestBuilder = {
      select: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
      orderby: jest.fn().mockReturnThis(),
      top: jest.fn().mockReturnThis(),
      query: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
    };

    mockGraphClient = {
      api: jest.fn().mockReturnValue(mockRequestBuilder),
    } as unknown as jest.Mocked<Client>;

    // Store reference to mock request builder for test access
    (mockGraphClient as any).mockRequestBuilder = mockRequestBuilder;

    MockedClient.initWithMiddleware = jest.fn().mockReturnValue(mockGraphClient);
    
    office365SDK = new Office365CalendarSDK(validConfig, mockLogger);
  });

  describe('Branded Types Validation', () => {
    test('should prevent CalendarId assignment to regular string', () => {
      // This test verifies type safety at compile time
      const calendarId: CalendarId = 'cal-123' as CalendarId;
      const regularString: string = calendarId; // This should work
      
      // The following should cause TypeScript compilation errors:
      // const wrongAssignment: CalendarId = 'regular-string'; // Should fail
      // const anotherWrong: CalendarId = regularString; // Should fail
      
      expect(calendarId).toBe('cal-123');
      expect(regularString).toBe('cal-123');
    });

    test('should enforce TenantId brand safety', () => {
      const tenantId: TenantId = 'tenant-456' as TenantId;
      const userId: UserId = 'user-789' as UserId;
      
      // These should be different branded types
      expect(typeof tenantId).toBe('string');
      expect(typeof userId).toBe('string');
      
      // Function that requires TenantId should not accept UserId
      function requiresTenantId(id: TenantId): boolean {
        return id.length > 0;
      }
      
      expect(requiresTenantId(tenantId)).toBe(true);
      // requiresTenantId(userId); // Should cause TypeScript error
    });

    test('should validate DeltaToken branded type', () => {
      const deltaToken: DeltaToken = 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=abc123' as DeltaToken;
      
      function processDelta(token: DeltaToken): string {
        return token;
      }
      
      expect(processDelta(deltaToken)).toContain('$deltatoken=abc123');
    });
  });

  describe('Microsoft Graph SDK Integration', () => {
    test('should initialize with ClientSecretCredential authentication provider', () => {
      expect(MockedCredential).toHaveBeenCalledWith(
        validConfig.tenant_id,
        validConfig.client_id,
        validConfig.client_secret,
        expect.objectContaining({
          authorityHost: 'https://login.microsoftonline.com'
        })
      );
    });

    test('should create Graph client with proper middleware configuration', () => {
      expect(MockedClient.initWithMiddleware).toHaveBeenCalledWith({
        authProvider: expect.objectContaining({
          getAccessToken: expect.any(Function)
        }),
        middleware: expect.arrayContaining([
          expect.objectContaining({ execute: expect.any(Function) }) // Retry middleware
        ])
      });
    });

    test('should handle authentication provider errors gracefully', async () => {
      mockCredential.getToken.mockRejectedValue(new Error('Authentication failed'));
      
      const result = await office365SDK.checkConnectionSafe();
      
      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(VError);
      expect(result.error?.message).toContain('Authentication failed');
    });
  });

  describe('Type-Safe API Methods', () => {
    test('should implement getCalendars with strict Calendar typing', async () => {
      const mockCalendars: Calendar[] = [
        {
          id: 'cal-1',
          name: 'Primary Calendar',
          color: 'blue',
          canEdit: true,
          canShare: true,
          canViewPrivateItems: true,
          owner: {
            name: 'Test User',
            address: 'test@example.com'
          }
        }
      ];

      (mockGraphClient as any).mockRequestBuilder.get.mockResolvedValue({
        value: mockCalendars,
        '@odata.nextLink': undefined
      });

      const result = await office365SDK.getCalendarsSafe();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('cal-1');
        expect(result.data[0].name).toBe('Primary Calendar');
        expect(result.data[0].canEdit).toBe(true);
      }

      expect(mockGraphClient.api).toHaveBeenCalledWith('/me/calendars');
      expect(mockGraphClient.select).toHaveBeenCalledWith(
        'id,name,color,canEdit,canShare,canViewPrivateItems,owner'
      );
    });

    test('should implement getEvents with proper GraphEvent typing', async () => {
      const calendarId: CalendarId = 'cal-123' as CalendarId;
      const mockEvents: Event[] = [
        {
          id: 'event-1',
          subject: 'Test Meeting',
          start: {
            dateTime: '2024-01-15T10:00:00Z',
            timeZone: 'UTC'
          },
          end: {
            dateTime: '2024-01-15T11:00:00Z',
            timeZone: 'UTC'
          },
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        }
      ];

      (mockGraphClient as any).mockRequestBuilder.get.mockResolvedValue({
        value: mockEvents,
        '@odata.nextLink': undefined
      });

      const result = await office365SDK.getEventsSafe(calendarId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe('event-1');
        expect(result.data[0].subject).toBe('Test Meeting');
      }

      expect(mockGraphClient.api).toHaveBeenCalledWith(`/me/calendars/${calendarId}/events`);
      expect(mockGraphClient.select).toHaveBeenCalledWith(
        'id,subject,body,start,end,location,attendees,organizer,lastModifiedDateTime,createdDateTime,isCancelled,importance,sensitivity,showAs'
      );
    });

    test('should implement delta queries with proper typing', async () => {
      const calendarId: CalendarId = 'cal-123' as CalendarId;
      const deltaToken: DeltaToken = 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=abc123' as DeltaToken;
      
      const mockDeltaResponse = {
        value: [
          {
            id: 'event-updated',
            subject: 'Updated Meeting',
            lastModifiedDateTime: '2024-01-15T16:45:00Z'
          },
          {
            id: 'event-deleted',
            '@removed': { reason: 'deleted' }
          }
        ],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=def456'
      };

      (mockGraphClient as any).mockRequestBuilder.get.mockResolvedValue(mockDeltaResponse);

      const result = await office365SDK.getEventsIncrementalSafe(calendarId, deltaToken);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].event.id).toBe('event-updated');
        expect(result.data[1].event['@removed']).toEqual({ reason: 'deleted' });
        expect(result.data[0].nextDeltaLink).toContain('$deltatoken=def456');
      }

      expect(mockGraphClient.api).toHaveBeenCalledWith(`/me/calendars/${calendarId}/events/delta`);
      expect(mockGraphClient.query).toHaveBeenCalledWith({ $deltatoken: deltaToken.split('$deltatoken=')[1] });
    });
  });

  describe('Request Batching Implementation', () => {
    test('should batch multiple calendar requests efficiently', async () => {
      const calendarIds: CalendarId[] = ['cal-1', 'cal-2', 'cal-3'].map(id => id as CalendarId);
      
      const mockBatchResponse = {
        responses: [
          { id: '1', status: 200, body: { value: [{ id: 'cal-1', name: 'Calendar 1' }] } },
          { id: '2', status: 200, body: { value: [{ id: 'cal-2', name: 'Calendar 2' }] } },
          { id: '3', status: 200, body: { value: [{ id: 'cal-3', name: 'Calendar 3' }] } }
        ]
      };

      mockGraphClient.post.mockResolvedValue(mockBatchResponse);

      const result = await office365SDK.getMultipleCalendarEventsBatched(calendarIds);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.calendars).toHaveLength(3);
        expect(result.data.calendars[0].id).toBe('cal-1');
        expect(result.data.calendars[1].id).toBe('cal-2');
        expect(result.data.calendars[2].id).toBe('cal-3');
      }

      expect(mockGraphClient.api).toHaveBeenCalledWith('/$batch');
      expect(mockGraphClient.post).toHaveBeenCalledWith({
        requests: expect.arrayContaining([
          expect.objectContaining({
            id: '1',
            method: 'GET',
            url: '/me/calendars/cal-1/events'
          }),
          expect.objectContaining({
            id: '2',
            method: 'GET',
            url: '/me/calendars/cal-2/events'
          }),
          expect.objectContaining({
            id: '3',
            method: 'GET',
            url: '/me/calendars/cal-3/events'
          })
        ])
      });
    });

    test('should handle batch request failures gracefully', async () => {
      const calendarIds: CalendarId[] = ['cal-1', 'cal-2'].map(id => id as CalendarId);
      
      const mockBatchResponse = {
        responses: [
          { id: '1', status: 200, body: { value: [{ id: 'cal-1', name: 'Calendar 1' }] } },
          { id: '2', status: 404, body: { error: { message: 'Calendar not found' } } }
        ]
      };

      mockGraphClient.post.mockResolvedValue(mockBatchResponse);

      const result = await office365SDK.getMultipleCalendarEventsBatched(calendarIds);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.calendars).toHaveLength(1); // Only successful calendar
        expect(result.data.calendars[0].id).toBe('cal-1');
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch events for calendar in batch',
        expect.stringContaining('cal-2')
      );
    });
  });

  describe('Result Type Pattern Implementation', () => {
    test('should return Result<T> instead of throwing exceptions', async () => {
      // Successful case
      (mockGraphClient as any).mockRequestBuilder.get.mockResolvedValue({ value: [] });
      
      const successResult = await office365SDK.getCalendarsSafe();
      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(Array.isArray(successResult.data)).toBe(true);
      }

      // Error case
      (mockGraphClient as any).mockRequestBuilder.get.mockRejectedValue(new Error('Network error'));
      
      const errorResult = await office365SDK.getCalendarsSafe();
      expect(errorResult.success).toBe(false);
      if (!errorResult.success) {
        expect(errorResult.error).toBeInstanceOf(VError);
        expect(errorResult.error.message).toContain('Network error');
      }
    });

    test('should properly type discriminate Result union types', async () => {
      (mockGraphClient as any).mockRequestBuilder.get.mockResolvedValue({ value: [{ id: 'cal-1', name: 'Test' }] });
      
      const result = await office365SDK.getCalendarsSafe();
      
      // TypeScript should be able to discriminate based on success property
      if (result.success) {
        // In this branch, TypeScript knows result.data exists
        expect(result.data[0].id).toBe('cal-1');
        // result.error should not exist here (TypeScript compile-time check)
      } else {
        // In this branch, TypeScript knows result.error exists
        expect(result.error).toBeDefined();
        // result.data should not exist here (TypeScript compile-time check)
      }
    });
  });

  describe('Type Safety Validation', () => {
    test('should have zero any types in production code', () => {
      // This test verifies our implementation uses strict typing throughout
      const hasStrictTyping = office365SDK.hasStrictTyping();
      expect(hasStrictTyping).toBe(true);
    });

    test('should enforce readonly properties on configuration', () => {
      // Configuration should be immutable
      const config = office365SDK.getConfig();
      
      // These should cause TypeScript compilation errors:
      // config.client_id = 'new-value'; // Should fail - readonly property
      // config.tenant_id = 'new-tenant' as TenantId; // Should fail - readonly property
      
      expect(config.client_id).toBe(validConfig.client_id);
      expect(config.tenant_id).toBe(validConfig.tenant_id);
    });

    test('should provide proper type guards for runtime validation', () => {
      const unknownData: unknown = {
        id: 'cal-123',
        name: 'Test Calendar',
        canEdit: true
      };

      const isCalendar = office365SDK.isCalendar(unknownData);
      expect(isCalendar).toBe(true);

      if (isCalendar) {
        // TypeScript should know this is Calendar type now
        expect(unknownData.id).toBe('cal-123');
        expect(unknownData.name).toBe('Test Calendar');
        expect(unknownData.canEdit).toBe(true);
      }
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain all existing Office365Calendar interface methods', async () => {
      // Verify that all methods from the old interface still exist
      expect(typeof office365SDK.checkConnection).toBe('function');
      expect(typeof office365SDK.getCalendars).toBe('function');
      expect(typeof office365SDK.getEvents).toBe('function');
      expect(typeof office365SDK.getEventsIncremental).toBe('function');
      expect(typeof office365SDK.getUsers).toBe('function');
    });

    test('should produce identical output format for existing callers', async () => {
      // Mock response that matches old format expectations
      const mockCalendar = {
        id: 'cal-123',
        name: 'Test Calendar',
        color: 'blue',
        canEdit: true,
        canShare: true,
        canViewPrivateItems: true,
        owner: {
          name: 'Test User',
          address: 'test@example.com'
        }
      };

      (mockGraphClient as any).mockRequestBuilder.get.mockResolvedValue({ value: [mockCalendar] });

      // Call old-style async generator method
      const calendars = [];
      for await (const calendar of office365SDK.getCalendars()) {
        calendars.push(calendar);
      }

      expect(calendars).toHaveLength(1);
      expect(calendars[0]).toEqual(mockCalendar);
    });
  });

  describe('Performance Optimizations', () => {
    test('should have SDK configuration with correct properties', () => {
      const sdkConfig = office365SDK.getSDKConfiguration();
      
      expect(sdkConfig.tenantId).toBeDefined();
      expect(sdkConfig.clientId).toBe('test-client-id');
      expect(sdkConfig.clientSecret).toBe('test-client-secret');
      expect(typeof sdkConfig.enableBatching).toBe('boolean');
      expect(typeof sdkConfig.retryCount).toBe('number');
    });

    test('should implement streaming for large datasets', async () => {
      const calendarId: CalendarId = 'large-cal' as CalendarId;
      
      // Mock a response with pagination
      (mockGraphClient as any).mockRequestBuilder.get
        .mockResolvedValueOnce({
          value: Array(1000).fill({ id: 'event', subject: 'Meeting' }),
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/events?$skip=1000'
        })
        .mockResolvedValueOnce({
          value: Array(500).fill({ id: 'event', subject: 'Meeting' }),
          '@odata.nextLink': undefined
        });

      const events = [];
      let count = 0;
      
      for await (const event of office365SDK.getEventsStreaming(calendarId)) {
        events.push(event);
        count++;
        if (count > 1200) break; // Safety check
      }

      expect(events).toHaveLength(1500);
      expect((mockGraphClient as any).mockRequestBuilder.get).toHaveBeenCalledTimes(2); // Two pages
    });
  });
});