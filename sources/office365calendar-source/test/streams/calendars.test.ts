import { SyncMode } from 'faros-airbyte-cdk';
import { VError } from 'verror';

import { Office365CalendarConfig, TenantId, CalendarId } from '../../src/models';
import { Office365Calendar } from '../../src/office365calendar';
import { Calendars } from '../../src/streams/calendars';
import { setupStreamTests, createMockCalendars, createMockCalendar, expectSuccessResult, expectErrorResult } from '../utils/test-helpers';

// Mock the Office365Calendar for testing
jest.mock('../../src/office365calendar', () => ({
  Office365Calendar: {
    instance: jest.fn()
  }
}));

const MockedOffice365Calendar = Office365Calendar as jest.Mocked<typeof Office365Calendar>;

describe('O365CAL-004: Calendars Stream (TDD)', () => {
  let calendarsStream: Calendars;
  let testSetup: ReturnType<typeof setupStreamTests>;

  beforeEach(() => {
    testSetup = setupStreamTests();
    MockedOffice365Calendar.instance.mockResolvedValue(testSetup.mockOffice365Calendar);
    
    calendarsStream = new Calendars(testSetup.validConfig, testSetup.mockLogger);
  });

  describe('Stream Configuration', () => {
    test('should have correct stream name', () => {
      expect(calendarsStream.name).toBe('calendars');
    });

    test('should have correct primary key', () => {
      expect(calendarsStream.primaryKey).toBe('id');
    });

    test('should support only full refresh sync mode', () => {
      expect(calendarsStream.supportedSyncModes).toEqual([SyncMode.FULL_REFRESH]);
    });

    test('should load calendars JSON schema', () => {
      const schema = calendarsStream.getJsonSchema();
      
      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.id).toBeDefined();
      expect(schema.properties.summary).toBeDefined(); // Google Calendar field mapping
    });

    test('should not support incremental sync mode', () => {
      expect(calendarsStream.supportedSyncModes).not.toContain(SyncMode.INCREMENTAL);
    });
  });

  describe('Calendar Data Fetching - Single User', () => {
    test('should fetch current user calendars when no specific config', async () => {
      const mockCalendars = createMockCalendars(2);

      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        for (const calendar of mockCalendars) {
          yield calendar;
        }
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(MockedOffice365Calendar.instance).toHaveBeenCalledWith(testSetup.validConfig, testSetup.mockLogger);
      expect(testSetup.mockOffice365Calendar.getCalendars).toHaveBeenCalledTimes(1);
    });

    test('should fetch specific calendars when calendar_ids provided', async () => {
      const configWithSpecificCalendars = {
        ...testSetup.validConfig,
        calendar_ids: ['cal-1', 'cal-2']
      };
      
      const specificCalendarsStream = new Calendars(configWithSpecificCalendars, testSetup.mockLogger);

      const mockCalendars = [createMockCalendars(1)[0]];

      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        for (const calendar of mockCalendars) {
          yield calendar;
        }
      });

      const records = [];
      for await (const record of specificCalendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('calendar-1');
    });
  });

  describe('Domain-Wide Delegation Support', () => {
    test('should fetch calendars for all users when domain_wide_delegation enabled', async () => {
      const configWithDelegation = {
        ...testSetup.validConfig,
        domain_wide_delegation: true
      };
      
      const delegationStream = new Calendars(configWithDelegation, testSetup.mockLogger);

      const mockUsers = [
        { id: 'user-1', mail: 'user1@example.com' },
        { id: 'user-2', mail: 'user2@example.com' }
      ];

      const mockCalendarsUser1 = [
        createMockCalendar({
          id: 'cal-user1-1',
          name: 'User 1 Calendar',
          owner: { name: 'User One', address: 'user1@example.com', email: 'user1@example.com' },
          canEdit: true,
          canShare: true,
          canViewPrivateItems: false
        })
      ];

      const mockCalendarsUser2 = [
        createMockCalendar({
          id: 'cal-user2-1',
          name: 'User 2 Calendar',
          owner: { name: 'User Two', address: 'user2@example.com', email: 'user2@example.com' },
          canEdit: true,
          canShare: false,
          canViewPrivateItems: true
        })
      ];

      testSetup.mockOffice365Calendar.getUsers.mockImplementation(async function* () {
        for (const user of mockUsers) {
          yield user;
        }
      });

      testSetup.mockOffice365Calendar.getCalendars
        .mockImplementationOnce(async function* () {
          for (const calendar of mockCalendarsUser1) {
            yield calendar;
          }
        })
        .mockImplementationOnce(async function* () {
          for (const calendar of mockCalendarsUser2) {
            yield calendar;
          }
        });

      const records = [];
      for await (const record of delegationStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(2);
      expect(records[0].id).toBe('cal-user1-1');
      expect(records[1].id).toBe('cal-user2-1');
      expect(testSetup.mockOffice365Calendar.getUsers).toHaveBeenCalledTimes(1);
      expect(testSetup.mockOffice365Calendar.getCalendars).toHaveBeenCalledTimes(2);
    });

    test('should handle users with no accessible calendars in delegation mode', async () => {
      const configWithDelegation = {
        ...testSetup.validConfig,
        domain_wide_delegation: true
      };
      
      const delegationStream = new Calendars(configWithDelegation, testSetup.mockLogger);

      const mockUsers = [
        { id: 'user-1', mail: 'user1@example.com' },
        { id: 'user-2', mail: 'user2@example.com' }
      ];

      testSetup.mockOffice365Calendar.getUsers.mockImplementation(async function* () {
        for (const user of mockUsers) {
          yield user;
        }
      });

      // User 1 has calendars, User 2 has none
      testSetup.mockOffice365Calendar.getCalendars
        .mockImplementationOnce(async function* () {
          yield createMockCalendar({
            id: 'cal-user1-1',
            name: 'User 1 Calendar',
            owner: { name: 'User One', address: 'user1@example.com', email: 'user1@example.com' },
            canEdit: true,
            canShare: true,
            canViewPrivateItems: false
          });
        })
        .mockImplementationOnce(async function* () {
          // No calendars for user 2
          return;
        });

      const records = [];
      for await (const record of delegationStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('cal-user1-1');
    });
  });

  describe('Data Mapping - Office 365 to Google Calendar Schema', () => {
    test('should map Office 365 calendar fields to Google Calendar schema', async () => {
      const office365Calendar = createMockCalendar({
        id: 'office365-cal-id',
        name: 'Office 365 Calendar Name',
        summary: 'Office 365 Calendar Name',
        description: 'Calendar description',
        owner: { 
          name: 'Calendar Owner',
          address: 'owner@example.com',
          email: 'owner@example.com'
        },
        canEdit: true,
        canShare: false,
        canViewPrivateItems: true
      });

      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        yield office365Calendar;
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      const mappedCalendar = records[0];

      // Verify Google Calendar schema mapping
      expect(mappedCalendar.id).toBe('office365-cal-id');
      expect(mappedCalendar.summary).toBe('Office 365 Calendar Name'); // name → summary
      expect(mappedCalendar.description).toBe('Calendar description');
      expect(mappedCalendar.owner).toEqual({
        name: 'Calendar Owner',
        email: 'owner@example.com'
      });
      
      // Check access role mapping
      expect(mappedCalendar.accessRole).toBeDefined();
      expect(mappedCalendar.canEdit).toBe(true);
      expect(mappedCalendar.canShare).toBe(false);
      expect(mappedCalendar.canViewPrivateItems).toBe(true);
    });

    test('should handle primary calendar identification', async () => {
      const office365Calendar = createMockCalendar({
        id: 'primary-calendar-id',
        name: 'Calendar', // Primary calendars often have generic names
        summary: 'Calendar',
        description: undefined,
        owner: { 
          name: 'Current User',
          address: 'currentuser@example.com',
          email: 'currentuser@example.com'
        },
        canEdit: true,
        canShare: true,
        canViewPrivateItems: true
      });

      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        yield office365Calendar;
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
      const mappedCalendar = records[0];

      // Should identify as primary calendar
      expect(mappedCalendar.primary).toBe(true);
      expect(mappedCalendar.accessRole).toBe('owner');
    });

    test('should map calendar permissions to access roles correctly', async () => {
      const testCases = [
        {
          input: { canEdit: true, canShare: true, canViewPrivateItems: true },
          expectedRole: 'owner'
        },
        {
          input: { canEdit: true, canShare: false, canViewPrivateItems: false },
          expectedRole: 'writer'
        },
        {
          input: { canEdit: false, canShare: false, canViewPrivateItems: false },
          expectedRole: 'reader'
        }
      ];

      for (const testCase of testCases) {
        const office365Calendar = createMockCalendar({
          id: 'test-calendar',
          name: 'Test Calendar',
          summary: 'Test Calendar',
          owner: { name: 'Owner', address: 'owner@example.com', email: 'owner@example.com' },
          ...testCase.input
        });

        testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
          yield office365Calendar;
        });

        const records = [];
        for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
          records.push(record);
        }

        expect(records[0].accessRole).toBe(testCase.expectedRole);
        
        // Reset mock for next iteration
        jest.clearAllMocks();
        MockedOffice365Calendar.instance.mockResolvedValue(testSetup.mockOffice365Calendar);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle permission errors gracefully and continue', async () => {
      const permissionError = new VError('Insufficient privileges to access calendar');
      
      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        throw permissionError;
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(records).toHaveLength(0);
      expect(testSetup.mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch calendars')
      );
    });

    test('should log warnings for individual calendar access failures', async () => {
      const office365Calendar = createMockCalendar({
        id: 'accessible-calendar',
        name: 'Accessible Calendar',
        summary: 'Accessible Calendar',
        owner: { name: 'Owner', address: 'owner@example.com', email: 'owner@example.com' },
        canEdit: true,
        canShare: true,
        canViewPrivateItems: false
      });

      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        yield office365Calendar;
        throw new VError('Access denied to calendar: restricted-calendar');
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      // Should still get the accessible calendar
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('accessible-calendar');
      
      // Should log warning about the failed calendar
      expect(testSetup.mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching calendar')
      );
    });

    test('should handle API rate limiting gracefully', async () => {
      const rateLimitError = new VError('Rate limit exceeded');
      
      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        throw rateLimitError;
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      // Should return no records due to the error
      expect(records).toHaveLength(0);
      // Should log the error
      expect(testSetup.mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch calendars')
      );
    });

    test('should handle authentication failures and re-throw', async () => {
      const authError = new VError('Authentication token expired');
      
      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        throw authError;
      });

      await expect(async () => {
        const records = [];
        for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
          records.push(record);
        }
      }).rejects.toThrow('Authentication token expired');
    });
  });

  describe('Stream Integration', () => {
    test('should properly initialize Office365Calendar with config and logger', async () => {
      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        yield createMockCalendar({
          id: 'test-calendar',
          name: 'Test Calendar',
          summary: 'Test Calendar',
          owner: { name: 'Owner', address: 'owner@example.com', email: 'owner@example.com' },
          canEdit: true,
          canShare: true,
          canViewPrivateItems: false
        });
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(MockedOffice365Calendar.instance).toHaveBeenCalledWith(testSetup.validConfig, testSetup.mockLogger);
      expect(records).toHaveLength(1);
    });

    test('should support stream state parameter (even though not used in full refresh)', async () => {
      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        yield createMockCalendar({
          id: 'test-calendar',
          name: 'Test Calendar',
          summary: 'Test Calendar',
          owner: { name: 'Owner', address: 'owner@example.com', email: 'owner@example.com' },
          canEdit: true,
          canShare: true,
          canViewPrivateItems: false
        });
      });

      const mockStreamState = { lastSyncToken: 'ignored-in-full-refresh' };

      const records = [];
      for await (const record of calendarsStream.readRecords(
        SyncMode.FULL_REFRESH,
        undefined,
        undefined,
        mockStreamState
      )) {
        records.push(record);
      }

      expect(records).toHaveLength(1);
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log sync progress for calendar fetching', async () => {
      const mockCalendars = [
        createMockCalendar({
          id: 'cal-1',
          name: 'Calendar 1',
          summary: 'Calendar 1',
          owner: { name: 'Owner', address: 'owner@example.com', email: 'owner@example.com' },
          canEdit: true,
          canShare: true,
          canViewPrivateItems: false
        }),
        createMockCalendar({
          id: 'cal-2',
          name: 'Calendar 2',
          summary: 'Calendar 2',
          owner: { name: 'Owner', address: 'owner@example.com', email: 'owner@example.com' },
          canEdit: true,
          canShare: false,
          canViewPrivateItems: true
        })
      ];

      testSetup.mockOffice365Calendar.getCalendars.mockImplementation(async function* () {
        for (const calendar of mockCalendars) {
          yield calendar;
        }
      });

      const records = [];
      for await (const record of calendarsStream.readRecords(SyncMode.FULL_REFRESH)) {
        records.push(record);
      }

      expect(testSetup.mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting calendars sync')
      );
      expect(testSetup.mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Fetched calendar'),
        expect.stringContaining('cal-1')
      );
      expect(testSetup.mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Completed calendars sync'),
        expect.stringContaining('2 calendars')
      );
    });
  });
});