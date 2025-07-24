// 🔥 DEMOLISH MODE: Office365Calendar SDK Adapter Tests 🔥

import { AirbyteLogger } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { Office365Calendar } from '../src/office365calendar-sdk-adapter';
import { Office365CalendarSDK } from '../src/office365calendar-sdk';
import { 
  Office365CalendarConfig,
  Calendar,
  Event,
  GraphCalendar,
  GraphEvent,
  EventDelta,
  asCalendarId,
  asUserId,
  asDeltaToken
} from '../src/models';
import { createMockLogger, createTestConfig, createMockEvent, createMockCalendar, createMockGraphEvent, createMockGraphCalendar } from './utils/test-helpers';

// Mock the underlying SDK
jest.mock('../src/office365calendar-sdk', () => ({
  Office365CalendarSDK: jest.fn().mockImplementation(() => ({
    checkConnection: jest.fn(),
    getCalendars: jest.fn(),
    getEvents: jest.fn(),
    getEventsIncremental: jest.fn(),
    getUsers: jest.fn()
  }))
}));

const MockedSDK = Office365CalendarSDK as jest.MockedClass<typeof Office365CalendarSDK>;

describe('🚀 O365CAL-020: SDK Adapter Demolition Tests', () => {
  let mockLogger: AirbyteLogger;
  let validConfig: Office365CalendarConfig;
  let mockSDK: jest.Mocked<Office365CalendarSDK>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    Office365Calendar.clearInstance();
    
    mockLogger = createMockLogger();
    validConfig = createTestConfig();
    
    // Create mock SDK instance
    mockSDK = {
      checkConnection: jest.fn(),
      getCalendars: jest.fn(),
      getEvents: jest.fn(),
      getEventsIncremental: jest.fn(),
      getUsers: jest.fn()
    } as any;
    
    MockedSDK.mockImplementation(() => mockSDK);
  });

  describe('🎯 Singleton Pattern & Instance Management', () => {
    test('should create singleton instance', async () => {
      const instance1 = await Office365Calendar.instance(validConfig, mockLogger);
      const instance2 = await Office365Calendar.instance(validConfig, mockLogger);
      
      expect(instance1).toBe(instance2);
      expect(MockedSDK).toHaveBeenCalledTimes(1);
    });

    test('should clear and recreate instance', async () => {
      const instance1 = await Office365Calendar.instance(validConfig, mockLogger);
      Office365Calendar.clearInstance();
      const instance2 = await Office365Calendar.instance(validConfig, mockLogger);
      
      expect(instance1).not.toBe(instance2);
      expect(MockedSDK).toHaveBeenCalledTimes(2);
    });
  });

  describe('🔗 Connection Validation', () => {
    test('should delegate checkConnection to SDK', async () => {
      mockSDK.checkConnection.mockResolvedValue(true);
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      const result = await adapter.checkConnection();
      
      expect(result).toBe(true);
      expect(mockSDK.checkConnection).toHaveBeenCalledWith();
    });

    test('should handle connection failures', async () => {
      mockSDK.checkConnection.mockRejectedValue(new Error('Connection failed'));
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(adapter.checkConnection()).rejects.toThrow('Connection failed');
      expect(mockSDK.checkConnection).toHaveBeenCalledWith();
    });
  });

  describe('📅 Calendar Operations', () => {
    test('should fetch calendars from SDK', async () => {
      const mockGraphCalendars = [
        createMockGraphCalendar({ id: 'cal-1', name: 'Calendar 1' }),
        createMockGraphCalendar({ id: 'cal-2', name: 'Calendar 2' })
      ];
      
      mockSDK.getCalendars.mockImplementation(async function* () {
        for (const calendar of mockGraphCalendars) {
          yield calendar;
        }
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      const calendars: Calendar[] = [];
      
      for await (const calendar of adapter.getCalendars()) {
        calendars.push(calendar);
      }
      
      expect(calendars).toHaveLength(2);
      expect(calendars[0].id).toBe('cal-1');
      expect(calendars[1].id).toBe('cal-2');
      expect(mockSDK.getCalendars).toHaveBeenCalledWith();
    });

    test('should handle calendar fetch errors', async () => {
      mockSDK.getCalendars.mockImplementation(async function* () {
        throw new Error('Calendar access denied');
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(async () => {
        for await (const calendar of adapter.getCalendars()) {
          // Should not reach here
        }
      }).rejects.toThrow('Calendar access denied');
    });
  });

  describe('📋 Event Operations', () => {
    test('should fetch events with proper parameter transformation', async () => {
      const mockGraphEvents = [
        createMockGraphEvent({ id: 'event-1', subject: 'Meeting 1' }),
        createMockGraphEvent({ id: 'event-2', subject: 'Meeting 2' })
      ];
      
      mockSDK.getEvents.mockImplementation(async function* () {
        for (const event of mockGraphEvents) {
          yield event;
        }
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      const events: Event[] = [];
      
      for await (const event of adapter.getEvents('calendar-123')) {
        events.push(event);
      }
      
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event-1');
      expect(events[1].id).toBe('event-2');
      
      // Verify SDK called with branded types
      expect(mockSDK.getEvents).toHaveBeenCalledWith(
        asCalendarId('calendar-123'),
        undefined,
        undefined
      );
    });

    test('should fetch events with userId parameter', async () => {
      const mockGraphEvents = [createMockGraphEvent({ id: 'event-1' })];
      
      mockSDK.getEvents.mockImplementation(async function* () {
        for (const event of mockGraphEvents) {
          yield event;
        }
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      const events: Event[] = [];
      
      for await (const event of adapter.getEvents('calendar-123', validConfig, 'user-456')) {
        events.push(event);
      }
      
      expect(mockSDK.getEvents).toHaveBeenCalledWith(
        asCalendarId('calendar-123'),
        validConfig,
        asUserId('user-456')
      );
    });

    test('should handle event fetch errors', async () => {
      mockSDK.getEvents.mockImplementation(async function* () {
        throw new VError('Failed to fetch events');
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(async () => {
        for await (const event of adapter.getEvents('calendar-123')) {
          // Should not reach here
        }
      }).rejects.toThrow('Failed to fetch events for calendar calendar-123');
    });
  });

  describe('🔄 Incremental Sync Operations', () => {
    test('should fetch incremental events with delta token', async () => {
      const mockEventDeltas: EventDelta[] = [
        {
          id: 'event-updated',
          changeType: 'updated',
          changeKey: 'change-key-1',
          event: createMockGraphEvent({ id: 'event-updated', subject: 'Updated Event' }),
          nextDeltaLink: 'delta-link-123'
        }
      ];
      
      mockSDK.getEventsIncremental.mockImplementation(async function* () {
        for (const eventDelta of mockEventDeltas) {
          yield eventDelta;
        }
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      const events: Event[] = [];
      
      for await (const result of adapter.getEventsIncremental('calendar-123', 'delta-token-abc', 'user-123')) {
        events.push(result.event);
      }
      
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('event-updated');
      expect(mockSDK.getEventsIncremental).toHaveBeenCalledWith(
        asCalendarId('calendar-123'),
        asDeltaToken('delta-token-abc'),
        asUserId('user-123')
      );
    });

    test('should handle incremental sync errors', async () => {
      mockSDK.getEventsIncremental.mockImplementation(async function* () {
        throw new VError('Delta token expired');
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(async () => {
        for await (const result of adapter.getEventsIncremental('calendar-123', 'expired-token', 'user-123')) {
          // Should not reach here
        }
      }).rejects.toThrow('Failed to fetch incremental events for calendar calendar-123');
    });
  });

  describe('👥 User Operations', () => {
    test('should fetch users from SDK', async () => {
      const mockUsers = [
        { id: asUserId('user-1'), mail: 'user1@example.com' },
        { id: asUserId('user-2'), mail: 'user2@example.com' }
      ];
      
      mockSDK.getUsers.mockImplementation(async function* () {
        for (const user of mockUsers) {
          yield user;
        }
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      const users: { id: string; mail?: string }[] = [];
      
      for await (const user of adapter.getUsers()) {
        users.push(user);
      }
      
      expect(users).toHaveLength(2);
      expect(users[0].id).toBe('user-1');
      expect(users[1].id).toBe('user-2');
      expect(mockSDK.getUsers).toHaveBeenCalledWith();
    });
  });

  describe('🛡️ Error Handling & Transformation', () => {
    test('should wrap SDK errors with context in getEvents', async () => {
      const originalError = new Error('Network timeout');
      mockSDK.getEvents.mockImplementation(async function* () {
        throw originalError;
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(async () => {
        for await (const event of adapter.getEvents('test-calendar')) {
          // Should not reach here
        }
      }).rejects.toThrow('Failed to fetch events for calendar test-calendar');
    });

    test('should wrap SDK errors with context in getEventsIncremental', async () => {
      const originalError = new Error('Authentication failed');
      mockSDK.getEventsIncremental.mockImplementation(async function* () {
        throw originalError;
      });
      
      const adapter = await Office365Calendar.instance(validConfig, mockLogger);
      
      await expect(async () => {
        for await (const result of adapter.getEventsIncremental('test-calendar', 'token', 'user-123')) {
          // Should not reach here
        }
      }).rejects.toThrow('Failed to fetch incremental events for calendar test-calendar');
    });
  });

  describe('⚙️ Configuration Integration', () => {
    test('should validate configuration on instantiation', async () => {
      const invalidConfig = { ...validConfig, client_id: '' };
      
      await expect(
        Office365Calendar.instance(invalidConfig, mockLogger)
      ).rejects.toThrow();
    });

    test('should pass configuration to SDK methods', async () => {
      mockSDK.getEvents.mockImplementation(async function* () {
        yield createMockGraphEvent({ id: 'test' });
      });
      
      const customConfig = { ...validConfig, cutoff_days: 30 };
      const adapter = await Office365Calendar.instance(customConfig, mockLogger);
      
      const events: Event[] = [];
      for await (const event of adapter.getEvents('cal-1', customConfig)) {
        events.push(event);
      }
      
      expect(mockSDK.getEvents).toHaveBeenCalledWith(
        asCalendarId('cal-1'),
        customConfig,
        undefined
      );
    });
  });
});