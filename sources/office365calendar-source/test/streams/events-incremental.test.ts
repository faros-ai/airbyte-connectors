import { AirbyteLogger, SyncMode } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { Office365CalendarConfig, TenantId, CalendarId } from '../../src/models';
import { Office365Calendar } from '../../src/office365calendar';
import { Events } from '../../src/streams/events';

// Mock the Office365Calendar for testing
jest.mock('../../src/office365calendar', () => ({
  Office365Calendar: {
    instance: jest.fn()
  }
}));

const MockedOffice365Calendar = Office365Calendar as jest.Mocked<typeof Office365Calendar>;

describe('O365CAL-006: Events Stream Incremental Sync (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let eventsStream: Events;
  let mockOffice365Calendar: jest.Mocked<Office365Calendar>;
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
      tenant_id: 'test-tenant-id'
    };

    mockOffice365Calendar = {
      getCalendars: jest.fn(),
      getUsers: jest.fn(),
      checkConnection: jest.fn(),
      getEvents: jest.fn(),
      getEventsIncremental: jest.fn(),
    } as unknown as jest.Mocked<Office365Calendar>;

    MockedOffice365Calendar.instance.mockResolvedValue(mockOffice365Calendar);
    
    eventsStream = new Events(validConfig, mockLogger);
  });

  describe('Incremental Sync Mode Support', () => {
    test('should support incremental sync mode', () => {
      expect(eventsStream.supportedSyncModes).toContain(SyncMode.INCREMENTAL);
    });

    test('should have correct cursor field', () => {
      expect(eventsStream.cursorField).toBe('nextSyncToken');
    });

    test('should support both full refresh and incremental modes', () => {
      expect(eventsStream.supportedSyncModes).toEqual([
        SyncMode.FULL_REFRESH,
        SyncMode.INCREMENTAL
      ]);
    });
  });

  describe('Incremental Sync Implementation', () => {
    test('should use full refresh for initial sync when no state exists', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          subject: 'Meeting 1',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        }
      ];

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = {}; // No existing state
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(mockOffice365Calendar.getEvents).toHaveBeenCalledWith('test-calendar', validConfig, undefined);
      expect(mockOffice365Calendar.getEventsIncremental).not.toHaveBeenCalled();
    });

    test('should use incremental sync when state exists with delta token', async () => {
      const mockIncrementalEvents = [
        {
          event: {
            id: 'event-updated',
            subject: 'Updated Meeting',
            start: { dateTime: '2024-01-16T10:00:00Z', timeZone: 'UTC' },
            end: { dateTime: '2024-01-16T11:00:00Z', timeZone: 'UTC' },
            createdDateTime: '2024-01-10T09:00:00Z',
            lastModifiedDateTime: '2024-01-15T16:45:00Z'
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=new-token-456'
        },
        {
          event: {
            id: 'event-deleted',
            '@removed': { reason: 'deleted' }
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=new-token-456'
        }
      ];

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        for (const item of mockIncrementalEvents) {
          yield item;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = {
        'test-calendar': { 
          lastSyncToken: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=existing-token-123'
        }
      };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(mockOffice365Calendar.getEventsIncremental).toHaveBeenCalledWith(
        'test-calendar',
        'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=existing-token-123'
      );
      expect(mockOffice365Calendar.getEvents).not.toHaveBeenCalled();
    });

    test('should include nextSyncToken in event records for state management', async () => {
      const mockIncrementalEvents = [
        {
          event: {
            id: 'event-1',
            subject: 'Meeting 1',
            start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
            end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
            createdDateTime: '2024-01-10T09:00:00Z',
            lastModifiedDateTime: '2024-01-12T14:30:00Z'
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-789'
        }
      ];

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        for (const item of mockIncrementalEvents) {
          yield item;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = {
        'test-calendar': { lastSyncToken: 'existing-token' }
      };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].nextSyncToken).toBe('https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-789');
    });
  });

  describe('Deleted Events Handling', () => {
    test('should handle deleted events with @removed annotation', async () => {
      const mockIncrementalEvents = [
        {
          event: {
            id: 'event-active',
            subject: 'Active Meeting',
            start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
            end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
            createdDateTime: '2024-01-10T09:00:00Z',
            lastModifiedDateTime: '2024-01-12T14:30:00Z'
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-123'
        },
        {
          event: {
            id: 'event-deleted',
            '@removed': { reason: 'deleted' }
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-123'
        }
      ];

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        for (const item of mockIncrementalEvents) {
          yield item;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = { 'test-calendar': { lastSyncToken: 'existing-token' } };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      
      // Active event should be mapped normally
      expect(records[0].id).toBe('event-active');
      expect(records[0].summary).toBe('Active Meeting');
      expect(records[0].status).toBe('confirmed');
      
      // Deleted event should retain @removed annotation
      expect(records[1].id).toBe('event-deleted');
      expect(records[1]['@removed']).toEqual({ reason: 'deleted' });
      expect(records[1].status).toBe('cancelled'); // Should map to cancelled status
    });

    test('should preserve deleted events structure for downstream processing', async () => {
      const mockDeletedEvent = {
        event: {
          id: 'deleted-event-123',
          '@removed': { reason: 'deleted' }
        },
        nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-456'
      };

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        yield mockDeletedEvent;
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = { 'test-calendar': { lastSyncToken: 'existing-token' } };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      const deletedRecord = records[0];
      
      // Should maintain Google Calendar schema while preserving deletion marker
      expect(deletedRecord.kind).toBe('calendar#event');
      expect(deletedRecord.id).toBe('deleted-event-123');
      expect(deletedRecord['@removed']).toEqual({ reason: 'deleted' });
      expect(deletedRecord.status).toBe('cancelled');
      expect(deletedRecord.nextSyncToken).toBe('https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-456');
    });
  });

  describe('State Management', () => {
    test('should implement getUpdatedState method', () => {
      expect(typeof eventsStream.getUpdatedState).toBe('function');
    });

    test('should update state with new sync token from latest record', () => {
      const currentState = {
        'calendar-1': { lastSyncToken: 'old-token-123' },
        'calendar-2': { lastSyncToken: 'other-token-456' }
      };

      const latestRecord = {
        kind: 'calendar#event',
        id: 'event-123',
        summary: 'Test Event',
        nextSyncToken: 'new-token-789',
        calendarId: 'calendar-1',
        created: '2024-01-10T09:00:00Z',
        updated: '2024-01-12T14:30:00Z',
        status: 'confirmed',
        transparency: 'opaque',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' }
      };

      const updatedState = eventsStream.getUpdatedState(currentState, latestRecord);

      expect(updatedState).toEqual({
        'calendar-1': { lastSyncToken: 'new-token-789' },
        'calendar-2': { lastSyncToken: 'other-token-456' }
      });
    });

    test('should not update state if record missing sync token', () => {
      const currentState = {
        'calendar-1': { lastSyncToken: 'existing-token-123' }
      };

      const recordWithoutToken = {
        kind: 'calendar#event',
        id: 'event-123',
        summary: 'Test Event',
        calendarId: 'calendar-1',
        created: '2024-01-10T09:00:00Z',
        updated: '2024-01-12T14:30:00Z',
        status: 'confirmed',
        transparency: 'opaque',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' }
        // No nextSyncToken
      };

      const updatedState = eventsStream.getUpdatedState(currentState, recordWithoutToken);

      expect(updatedState).toEqual(currentState);
    });

    test('should handle empty state correctly', () => {
      const emptyState = {};

      const latestRecord = {
        kind: 'calendar#event',
        id: 'event-123',
        summary: 'Test Event',
        nextSyncToken: 'first-token-123',
        calendarId: 'calendar-1',
        created: '2024-01-10T09:00:00Z',
        updated: '2024-01-12T14:30:00Z',
        status: 'confirmed',
        transparency: 'opaque',
        start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' }
      };

      const updatedState = eventsStream.getUpdatedState(emptyState, latestRecord);

      expect(updatedState).toEqual({
        'calendar-1': { lastSyncToken: 'first-token-123' }
      });
    });
  });

  describe('Error Handling and Fallback', () => {
    test('should fallback to full refresh on expired delta token (410 error)', async () => {
      const expiredTokenError = new VError('Delta token expired');
      expiredTokenError.name = 'AxiosError';
      (expiredTokenError as any).response = { status: 410 };

      // First call fails with 410, second call with full refresh succeeds
      mockOffice365Calendar.getEventsIncremental
        .mockRejectedValueOnce(expiredTokenError);

      mockOffice365Calendar.getEvents.mockImplementation(async function* () {
        yield {
          id: 'event-fallback',
          subject: 'Fallback Event',
          start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
          end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
          createdDateTime: '2024-01-10T09:00:00Z',
          lastModifiedDateTime: '2024-01-12T14:30:00Z'
        };
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = { 'test-calendar': { lastSyncToken: 'expired-token' } };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('event-fallback');
      
      // Should log warning about fallback
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Delta token expired'),
        expect.stringContaining('falling back to full refresh')
      );
      
      // Should eventually call full refresh
      expect(mockOffice365Calendar.getEvents).toHaveBeenCalledWith('test-calendar', validConfig, undefined);
    });

    test('should handle network errors during incremental sync', async () => {
      const networkError = new VError('Network connection failed');
      
      mockOffice365Calendar.getEventsIncremental.mockRejectedValueOnce(networkError);

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = { 'test-calendar': { lastSyncToken: 'valid-token' } };
      
      const records = [];
      
      await expect(async () => {
        for await (const record of eventsStream.readRecords(
          SyncMode.INCREMENTAL,
          ['nextSyncToken'],
          streamSlice,
          streamState
        )) {
          records.push(record);
        }
      }).rejects.toThrow('Network connection failed');

      expect(records).toHaveLength(0);
    });

    test('should handle malformed delta response gracefully', async () => {
      const malformedDeltaEvents = [
        {
          event: null, // Malformed event
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-123'
        }
      ];

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        for (const item of malformedDeltaEvents) {
          yield item;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = { 'test-calendar': { lastSyncToken: 'valid-token' } };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      // Should skip malformed events and continue
      expect(records).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping malformed event in delta response')
      );
    });
  });

  describe('Multi-Calendar State Management', () => {
    test('should handle state independently per calendar', async () => {
      // Test that each calendar slice uses its own state
      const mockIncrementalEvents = [
        {
          event: {
            id: 'event-cal1',
            subject: 'Calendar 1 Event',
            start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
            end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
            createdDateTime: '2024-01-10T09:00:00Z',
            lastModifiedDateTime: '2024-01-12T14:30:00Z'
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=cal1-token'
        }
      ];

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        for (const item of mockIncrementalEvents) {
          yield item;
        }
      });

      const streamSlice1 = { calendarId: 'calendar-1' };
      const streamSlice2 = { calendarId: 'calendar-2' };
      const streamState = {
        'calendar-1': { lastSyncToken: 'token-cal1' },
        'calendar-2': { lastSyncToken: 'token-cal2' }
      };
      
      // Test calendar-1
      const records1 = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice1,
        streamState
      )) {
        records1.push(record);
      }

      expect(mockOffice365Calendar.getEventsIncremental).toHaveBeenCalledWith(
        'calendar-1',
        'token-cal1'
      );
      expect(records1).toHaveLength(1);
      expect(records1[0].id).toBe('event-cal1');
    });
  });

  describe('Performance and Efficiency', () => {
    test('should log performance metrics for incremental vs full refresh', async () => {
      const mockIncrementalEvents = [
        {
          event: {
            id: 'event-1',
            subject: 'Changed Event',
            start: { dateTime: '2024-01-15T10:00:00Z', timeZone: 'UTC' },
            end: { dateTime: '2024-01-15T11:00:00Z', timeZone: 'UTC' },
            createdDateTime: '2024-01-10T09:00:00Z',
            lastModifiedDateTime: '2024-01-15T16:45:00Z' // Recently modified
          },
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/events/delta?$deltatoken=token-123'
        }
      ];

      mockOffice365Calendar.getEventsIncremental.mockImplementation(async function* () {
        for (const item of mockIncrementalEvents) {
          yield item;
        }
      });

      const streamSlice = { calendarId: 'test-calendar' };
      const streamState = { 'test-calendar': { lastSyncToken: 'existing-token' } };
      
      const records = [];
      for await (const record of eventsStream.readRecords(
        SyncMode.INCREMENTAL,
        ['nextSyncToken'],
        streamSlice,
        streamState
      )) {
        records.push(record);
      }

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Completed incremental events sync'),
        expect.stringContaining('1 events')
      );
    });
  });
});