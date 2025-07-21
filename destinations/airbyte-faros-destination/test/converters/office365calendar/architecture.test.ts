import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter} from '../../../src/converters/converter';
import {Office365CalendarConverter} from '../../../src/converters/office365calendar/common';

describe('Office365CalendarConverter Architecture', () => {
  describe('Base Class Design', () => {
    test('should extend base Converter class', () => {
      class TestConverter extends Office365CalendarConverter {
        readonly destinationModels = ['test_Model'];
        async convert(): Promise<any[]> {
          return [];
        }
      }

      const converter = new TestConverter();
      expect(converter).toBeInstanceOf(Converter);
      expect(converter).toBeInstanceOf(Office365CalendarConverter);
    });

    test('should have source property set to Office365Calendar', () => {
      class TestConverter extends Office365CalendarConverter {
        readonly destinationModels = ['test_Model'];
        async convert(): Promise<any[]> {
          return [];
        }
      }

      const converter = new TestConverter();
      expect(converter.source).toBe('Office365Calendar');
    });

    test('should extract record ID correctly from Office 365 event data', () => {
      class TestConverter extends Office365CalendarConverter {
        readonly destinationModels = ['test_Model'];
        async convert(): Promise<any[]> {
          return [];
        }
      }

      const converter = new TestConverter();
      const record = AirbyteRecord.make('events', {
        id: 'office365-event-123',
        subject: 'Test Meeting',
        start: { dateTime: '2023-01-01T10:00:00Z' }
      });

      expect(converter.id(record)).toBe('office365-event-123');
    });

    test('should handle malformed records gracefully', () => {
      class TestConverter extends Office365CalendarConverter {
        readonly destinationModels = ['test_Model'];
        async convert(): Promise<any[]> {
          return [];
        }
      }

      const converter = new TestConverter();
      
      // Test with null record
      expect(converter.id(null as any)).toBeUndefined();
      
      // Test with undefined record data
      const recordWithoutData = AirbyteRecord.make('events', undefined as any);
      expect(converter.id(recordWithoutData)).toBeUndefined();
      
      // Test with record missing id field
      const recordWithoutId = AirbyteRecord.make('events', {
        subject: 'Test Meeting',
        start: { dateTime: '2023-01-01T10:00:00Z' }
      });
      expect(converter.id(recordWithoutId)).toBeUndefined();
    });

    test('should handle nested record structure correctly', () => {
      class TestConverter extends Office365CalendarConverter {
        readonly destinationModels = ['test_Model'];
        async convert(): Promise<any[]> {
          return [];
        }
      }

      const converter = new TestConverter();
      const record = AirbyteRecord.make('events', {
        id: 'nested-event-456',
        calendar: {
          id: 'calendar-123',
          name: 'Work Calendar'
        },
        subject: 'Nested Test Meeting'
      });

      expect(converter.id(record)).toBe('nested-event-456');
    });
  });

  describe('Error Handling', () => {
    test('should handle record processing errors gracefully', () => {
      class TestConverter extends Office365CalendarConverter {
        readonly destinationModels = ['test_Model'];
        async convert(): Promise<any[]> {
          return [];
        }
      }

      const converter = new TestConverter();
      
      // Should not throw for any malformed input
      expect(() => converter.id(undefined as any)).not.toThrow();
      expect(() => converter.id({} as any)).not.toThrow();
      expect(() => converter.id({ record: {} } as any)).not.toThrow();
    });
  });
});