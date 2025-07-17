import { AirbyteLogger, AirbyteSpec, AirbyteStreamBase } from 'faros-airbyte-cdk';
import { VError } from 'verror';
import { Command } from 'commander';

import { 
  Office365CalendarConfig, 
  createValidatedConfig,
  asTenantId,
  asCalendarId
} from '../src/models';
import { Office365CalendarSource, mainCommand } from '../src/index';
import { Office365Calendar } from '../src/office365calendar';
import { Calendars } from '../src/streams/calendars';
import { Events } from '../src/streams/events';

// Mock dependencies
jest.mock('../src/office365calendar', () => ({
  Office365Calendar: {
    instance: jest.fn()
  }
}));
jest.mock('../src/streams/calendars');
jest.mock('../src/streams/events');

const MockedOffice365Calendar = Office365Calendar as jest.Mocked<typeof Office365Calendar>;
const MockedCalendars = Calendars as jest.MockedClass<typeof Calendars>;
const MockedEvents = Events as jest.MockedClass<typeof Events>;

describe('O365CAL-007: Main Source Implementation (TDD)', () => {
  let mockLogger: AirbyteLogger;
  let validConfig: Office365CalendarConfig;
  let rawValidConfig: any;
  let mockOffice365Calendar: jest.Mocked<Office365Calendar>;
  let source: Office365CalendarSource;

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

    rawValidConfig = {
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      tenant_id: '12345678-1234-1234-1234-123456789012'
    };
    
    validConfig = createValidatedConfig(rawValidConfig);

    mockOffice365Calendar = {
      checkConnection: jest.fn(),
      getCalendars: jest.fn(),
      getEvents: jest.fn(),
      getEventsIncremental: jest.fn(),
      getUsers: jest.fn(),
    } as unknown as jest.Mocked<Office365Calendar>;

    MockedOffice365Calendar.instance.mockResolvedValue(mockOffice365Calendar);
    
    source = new Office365CalendarSource(mockLogger);
  });

  describe('Source Class Structure', () => {
    test('should extend AirbyteSourceBase correctly', () => {
      expect(source).toBeInstanceOf(Office365CalendarSource);
      expect(typeof source.type).toBe('string');
      expect(typeof source.spec).toBe('function');
      expect(typeof source.checkConnection).toBe('function');
      expect(typeof source.streams).toBe('function');
    });

    test('should have correct source type', () => {
      expect(source.type).toBe('office365-calendar');
    });

    test('should return valid AirbyteSpec', async () => {
      const spec = await source.spec();
      
      expect(spec).toBeInstanceOf(AirbyteSpec);
      expect(spec.connectionSpecification).toBeDefined();
      expect(spec.connectionSpecification.properties).toBeDefined();
      
      // Verify required properties exist
      const properties = spec.connectionSpecification.properties;
      expect(properties.client_id).toBeDefined();
      expect(properties.client_secret).toBeDefined();
      expect(properties.tenant_id).toBeDefined();
      
      // Verify required fields
      const required = spec.connectionSpecification.required;
      expect(required).toContain('client_id');
      expect(required).toContain('client_secret');
      expect(required).toContain('tenant_id');
    });
  });

  describe('Connection Validation', () => {
    test('should pass connection check with valid credentials', async () => {
      mockOffice365Calendar.checkConnection.mockResolvedValue(true);
      
      const [success, error] = await source.checkConnection(validConfig);
      
      expect(success).toBe(true);
      expect(error).toBeUndefined();
      expect(MockedOffice365Calendar.instance).toHaveBeenCalledWith(validConfig, mockLogger);
      expect(mockOffice365Calendar.checkConnection).toHaveBeenCalled();
    });

    test('should fail connection check with invalid credentials', async () => {
      const authError = new Error('Authentication failed');
      mockOffice365Calendar.checkConnection.mockRejectedValue(authError);
      
      const [success, error] = await source.checkConnection(validConfig);
      
      expect(success).toBe(false);
      expect(error).toBeInstanceOf(VError);
      expect(error?.message).toContain('Failed to connect to Office 365');
      expect(error?.message).toContain('Authentication failed');
    });

    test('should handle network connectivity issues', async () => {
      const networkError = new Error('Network timeout');
      mockOffice365Calendar.checkConnection.mockRejectedValue(networkError);
      
      const [success, error] = await source.checkConnection(validConfig);
      
      expect(success).toBe(false);
      expect(error).toBeInstanceOf(VError);
      expect(error?.message).toContain('Network timeout');
    });

    test('should provide helpful error message for invalid tenant_id', async () => {
      const tenantError = new Error('Tenant \'invalid-tenant\' not found');
      mockOffice365Calendar.checkConnection.mockRejectedValue(tenantError);
      
      const [success, error] = await source.checkConnection(validConfig);
      
      expect(success).toBe(false);
      expect(error).toBeInstanceOf(VError);
      expect(error?.message).toContain('verify your tenant_id, client_id, and client_secret are correct');
    });

    test('should handle permission denied errors gracefully', async () => {
      const permissionError = new Error('Insufficient privileges to complete the operation');
      mockOffice365Calendar.checkConnection.mockRejectedValue(permissionError);
      
      const [success, error] = await source.checkConnection(validConfig);
      
      expect(success).toBe(false);
      expect(error?.message).toContain('Please verify your application has the required permissions');
    });

    test('should validate specific calendar access when calendar_ids provided', async () => {
      const configWithCalendars = createValidatedConfig({
        ...rawValidConfig,
        calendar_ids: ['cal-1', 'cal-2']
      });

      // Mock successful connection but calendar access failure
      mockOffice365Calendar.checkConnection.mockResolvedValue(true);
      
      // Mock getting calendars to verify access
      const mockCalendarsIterator = (async function* () {
        yield { id: asCalendarId('cal-1'), name: 'Calendar 1' };
        // Note: cal-2 is missing, simulating access issue
      })();
      mockOffice365Calendar.getCalendars.mockReturnValue(mockCalendarsIterator);
      
      const [success] = await source.checkConnection(configWithCalendars);
      
      expect(success).toBe(true); // Basic connection works
      expect(mockOffice365Calendar.checkConnection).toHaveBeenCalled();
    });
  });

  describe('Stream Management', () => {
    test('should return both Calendars and Events streams', () => {
      const streams = source.streams(validConfig);
      
      expect(streams).toHaveLength(2);
      expect(MockedCalendars).toHaveBeenCalledWith(validConfig, mockLogger);
      expect(MockedEvents).toHaveBeenCalledWith(validConfig, mockLogger);
    });

    test('should pass configuration to streams correctly', () => {
      const configWithOptions = createValidatedConfig({
        ...rawValidConfig,
        calendar_ids: ['cal-1', 'cal-2'],
        domain_wide_delegation: true,
        events_max_results: 1000,
        cutoff_days: 30
      });
      
      source.streams(configWithOptions);
      
      expect(MockedCalendars).toHaveBeenCalledWith(configWithOptions, mockLogger);
      expect(MockedEvents).toHaveBeenCalledWith(configWithOptions, mockLogger);
    });

    test('should return stream instances that are AirbyteStreamBase', () => {
      const mockCalendarsInstance = {} as unknown as Calendars;
      const mockEventsInstance = {} as unknown as Events;
      
      MockedCalendars.mockImplementation(() => mockCalendarsInstance);
      MockedEvents.mockImplementation(() => mockEventsInstance);
      
      const streams = source.streams(validConfig);
      
      expect(streams[0]).toBe(mockCalendarsInstance);
      expect(streams[1]).toBe(mockEventsInstance);
    });

    test('should handle stream initialization errors gracefully', () => {
      MockedCalendars.mockImplementation(() => {
        throw new Error('Failed to initialize Calendars stream');
      });
      
      expect(() => source.streams(validConfig)).toThrow('Failed to initialize Calendars stream');
    });
  });

  describe('Configuration Validation', () => {
    test('should handle missing required fields', async () => {
      const invalidConfig = createValidatedConfig({
        client_id: '',
        client_secret: 'test-secret',
        tenant_id: '12345678-1234-1234-1234-123456789012'
      });
      
      // The configuration validation should happen before we even try to connect
      expect(() => createValidatedConfig({
        client_id: '',
        client_secret: 'test-secret',
        tenant_id: '12345678-1234-1234-1234-123456789012'
      })).toThrow('client_id must not be an empty string');
    });

    test('should validate tenant_id format', () => {
      expect(() => createValidatedConfig({
        ...rawValidConfig,
        tenant_id: 'invalid-tenant-id'
      })).toThrow('tenant_id must be a valid GUID or domain name');
    });

    test('should accept domain-style tenant_id', () => {
      const configWithDomain = createValidatedConfig({
        ...rawValidConfig,
        tenant_id: 'contoso.onmicrosoft.com'
      });
      
      expect(configWithDomain.tenant_id).toBe('contoso.onmicrosoft.com');
    });

    test('should validate events_max_results range', () => {
      expect(() => createValidatedConfig({
        ...rawValidConfig,
        events_max_results: 0
      })).toThrow('events_max_results must be between 1 and 2500');
      
      expect(() => createValidatedConfig({
        ...rawValidConfig,
        events_max_results: 3000
      })).toThrow('events_max_results must be between 1 and 2500');
    });

    test('should validate cutoff_days minimum value', () => {
      expect(() => createValidatedConfig({
        ...rawValidConfig,
        cutoff_days: 0
      })).toThrow('cutoff_days must be at least 1');
    });
  });

  describe('Error Handling and Logging', () => {
    test('should log source initialization', () => {
      new Office365CalendarSource(mockLogger);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Office365CalendarSource initialized')
      );
    });

    test('should log connection check attempts', async () => {
      mockOffice365Calendar.checkConnection.mockResolvedValue(true);
      
      await source.checkConnection(validConfig);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Checking connection to Office 365')
      );
    });

    test('should log connection check failures with details', async () => {
      const error = new Error('Connection failed');
      mockOffice365Calendar.checkConnection.mockRejectedValue(error);
      
      await source.checkConnection(validConfig);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Connection check failed'),
        expect.objectContaining({
          error: error.message,
          tenantId: validConfig.tenant_id
        })
      );
    });

    test('should log stream initialization', () => {
      source.streams(validConfig);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Initializing streams'),
        expect.objectContaining({
          streamCount: 2
        })
      );
    });
  });

  describe('CLI Entry Point', () => {
    test('should return Commander.js command from mainCommand', () => {
      const command = mainCommand();
      
      expect(command).toBeInstanceOf(Command);
      expect(typeof command.parse).toBe('function');
      expect(typeof command.parseAsync).toBe('function');
    });

    test('should initialize source with logger correctly', () => {
      // This is more of an integration test, but we can verify the structure
      const command = mainCommand();
      
      expect(command).toBeDefined();
      // The actual command setup is handled by AirbyteSourceRunner
      // We just need to ensure it doesn't throw during initialization
    });
  });

  describe('Advanced Configuration Scenarios', () => {
    test('should handle domain-wide delegation configuration', async () => {
      const delegationConfig = createValidatedConfig({
        ...rawValidConfig,
        domain_wide_delegation: true
      });
      
      mockOffice365Calendar.checkConnection.mockResolvedValue(true);
      
      const [success] = await source.checkConnection(delegationConfig);
      
      expect(success).toBe(true);
      expect(MockedOffice365Calendar.instance).toHaveBeenCalledWith(
        expect.objectContaining({
          domain_wide_delegation: true
        }),
        mockLogger
      );
    });

    test('should handle calendar filtering configuration', () => {
      const filteredConfig = createValidatedConfig({
        ...rawValidConfig,
        calendar_ids: ['calendar-1', 'calendar-2', 'calendar-3']
      });
      
      const streams = source.streams(filteredConfig);
      
      expect(streams).toHaveLength(2);
      expect(MockedCalendars).toHaveBeenCalledWith(
        expect.objectContaining({
          calendar_ids: expect.arrayContaining([
            expect.any(String), // These are now branded CalendarId types
            expect.any(String),
            expect.any(String)
          ])
        }),
        mockLogger
      );
    });

    test('should handle custom sync parameters', () => {
      const customConfig = createValidatedConfig({
        ...rawValidConfig,
        events_max_results: 500,
        cutoff_days: 7
      });
      
      source.streams(customConfig);
      
      expect(MockedEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          events_max_results: 500,
          cutoff_days: 7
        }),
        mockLogger
      );
    });
  });

  describe('Integration with Airbyte CDK', () => {
    test('should follow AirbyteSourceBase contract', () => {
      expect(source.type).toBe('office365-calendar');
      expect(typeof source.spec).toBe('function');
      expect(typeof source.checkConnection).toBe('function');
      expect(typeof source.streams).toBe('function');
    });

    test('should return proper spec format for Airbyte', async () => {
      const spec = await source.spec();
      
      expect(spec.connectionSpecification.type).toBe('object');
      expect(Array.isArray(spec.connectionSpecification.required)).toBe(true);
      expect(typeof spec.connectionSpecification.properties).toBe('object');
    });

    test('should return connection result in Airbyte format', async () => {
      mockOffice365Calendar.checkConnection.mockResolvedValue(true);
      
      const result = await source.checkConnection(validConfig);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(typeof result[0]).toBe('boolean');
      // result[1] can be VError or undefined
    });

    test('should return streams as AirbyteStreamBase array', () => {
      const streams = source.streams(validConfig);
      
      expect(Array.isArray(streams)).toBe(true);
      expect(streams).toHaveLength(2);
      // Each stream should be an instance of AirbyteStreamBase (mocked)
    });
  });
});