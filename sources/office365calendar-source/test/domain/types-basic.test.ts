import { 
  TenantId, 
  ClientId, 
  CalendarId, 
  EventId, 
  UserId,
  Timestamp,
  createTenantId,
  createClientId,
  createCalendarId,
  createEventId,
  createUserId,
  createTimestamp
} from '../../src/domain/types';

describe('Immutable Branded Types - Basic Tests', () => {
  describe('Type Safety and Branding', () => {
    test('branded types should prevent accidental mixing', () => {
      const tenantId = createTenantId('12345678-1234-5678-9abc-123456789012');
      const clientId = createClientId('12345678-1234-5678-9abc-123456789012');
      
      // This should not compile if types are properly branded
      expect(TenantId.isTenantId(tenantId)).toBe(true);
      expect(TenantId.isTenantId(clientId)).toBe(false);
      expect(ClientId.isClientId(clientId)).toBe(true);
      expect(ClientId.isClientId(tenantId)).toBe(false);
    });

    test('branded types should be immutable after creation', () => {
      const tenantId = createTenantId('12345678-1234-5678-9abc-123456789012');
      const originalValue = tenantId.value;
      
      // Attempting to modify should not affect the branded type
      expect(tenantId.value).toBe(originalValue);
      
      // In strict mode, attempting to modify a frozen object should throw
      expect(() => {
        (tenantId as any).value = 'modified';
      }).toThrow(); // Object.freeze prevents runtime modification
      
      // The value should remain unchanged
      expect(tenantId.value).toBe(originalValue);
    });

    test('type guards should work correctly', () => {
      const tenantId = createTenantId('12345678-1234-5678-9abc-123456789012');
      const calendarId = createCalendarId('calendar_123');
      const eventId = createEventId('event_456');
      const userId = createUserId('user_789');
      const timestamp = createTimestamp(Date.now());
      
      // Positive tests
      expect(TenantId.isTenantId(tenantId)).toBe(true);
      expect(CalendarId.isCalendarId(calendarId)).toBe(true);
      expect(EventId.isEventId(eventId)).toBe(true);
      expect(UserId.isUserId(userId)).toBe(true);
      expect(Timestamp.isTimestamp(timestamp)).toBe(true);
      
      // Negative tests
      expect(TenantId.isTenantId(calendarId)).toBe(false);
      expect(CalendarId.isCalendarId(eventId)).toBe(false);
      expect(EventId.isEventId(userId)).toBe(false);
      expect(UserId.isUserId(timestamp)).toBe(false);
      expect(Timestamp.isTimestamp(tenantId)).toBe(false);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty strings gracefully', () => {
      expect(() => createCalendarId('')).toThrow('ID cannot be empty');
      expect(() => createEventId('')).toThrow('ID cannot be empty');
      expect(() => createUserId('')).toThrow('ID cannot be empty');
    });

    test('should handle whitespace-only strings', () => {
      expect(() => createCalendarId('   ')).toThrow('ID cannot be empty');
      expect(() => createEventId('\t\n  ')).toThrow('ID cannot be empty');
    });

    test('should handle null and undefined', () => {
      expect(() => createCalendarId(null as any)).toThrow('ID cannot be null or undefined');
      expect(() => createEventId(undefined as any)).toThrow('ID cannot be null or undefined');
    });

    test('should handle very long strings', () => {
      const longString = 'a'.repeat(1000);
      expect(() => createCalendarId(longString)).toThrow('ID too long');
    });

    test('should handle special characters in IDs', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const calendarId = createCalendarId(specialChars);
      expect(calendarId.value).toBe(specialChars);
    });

    test('should handle unicode characters in IDs', () => {
      const unicode = '测试🎉αβγ';
      const eventId = createEventId(unicode);
      expect(eventId.value).toBe(unicode);
    });

    test('timestamp should handle edge cases', () => {
      // Test minimum timestamp
      const minTimestamp = createTimestamp(0);
      expect(minTimestamp.toDate().getTime()).toBe(0);
      
      // Test maximum reasonable timestamp (year 2100)
      const maxTimestamp = createTimestamp(4102444800000); // 2100-01-01
      expect(maxTimestamp.toDate().getTime()).toBe(4102444800000);
      
      // Test negative timestamp (should throw)
      expect(() => createTimestamp(-1)).toThrow('Timestamp cannot be negative');
    });
  });

  describe('Equality and Hashing', () => {
    test('equal branded types should be equal', () => {
      const id1 = createCalendarId('test');
      const id2 = createCalendarId('test');
      
      expect(id1.equals(id2)).toBe(true);
      expect(id2.equals(id1)).toBe(true);
    });

    test('different branded types should not be equal', () => {
      const id1 = createCalendarId('test1');
      const id2 = createCalendarId('test2');
      
      expect(id1.equals(id2)).toBe(false);
      expect(id2.equals(id1)).toBe(false);
    });

    test('equal objects should have equal hash codes', () => {
      const id1 = createUserId('test');
      const id2 = createUserId('test');
      
      expect(id1.hashCode()).toBe(id2.hashCode());
    });

    test('timestamps should support ordering', () => {
      const ts1 = createTimestamp(1000);
      const ts2 = createTimestamp(2000);
      
      expect(ts1.isBefore(ts2)).toBe(true);
      expect(ts2.isAfter(ts1)).toBe(true);
      expect(ts1.equals(ts2)).toBe(false);
    });
  });

  describe('GUID Validation', () => {
    test('should accept valid GUIDs', () => {
      const validGuid = '12345678-1234-5678-9abc-123456789012';
      const tenantId = createTenantId(validGuid);
      
      expect(tenantId.isValid()).toBe(true);
      expect(tenantId.value).toBe(validGuid.toLowerCase());
    });

    test('should reject invalid GUIDs', () => {
      const invalidGuids = [
        '1234567-1234-5678-9abc-123456789012', // Too short
        '12345678-1234-5678-9abc-123456789012345', // Too long
        '12345678-1234-5678-9abc-12345678901g', // Invalid character
        '12345678-1234-5678-9abc-123456789012-', // Extra dash
        '12345678_1234_5678_9abc_123456789012', // Wrong separator
        'not-a-guid-at-all'
      ];
      
      invalidGuids.forEach(guid => {
        expect(() => createTenantId(guid)).toThrow('Invalid GUID format');
      });
    });
  });

  describe('Serialization', () => {
    test('should serialize and deserialize correctly', () => {
      const tenantId = createTenantId('12345678-1234-5678-9abc-123456789012');
      const calendarId = createCalendarId('calendar_123');
      
      const serialized = JSON.stringify({ tenantId, calendarId });
      const parsed = JSON.parse(serialized);
      
      const recreatedTenantId = createTenantId(parsed.tenantId.value);
      const recreatedCalendarId = createCalendarId(parsed.calendarId.value);
      
      expect(recreatedTenantId.equals(tenantId)).toBe(true);
      expect(recreatedCalendarId.equals(calendarId)).toBe(true);
    });
  });
});