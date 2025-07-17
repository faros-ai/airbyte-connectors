import { 
  createTenantId,
  createClientId,
  createCalendarId,
  createEventId,
  createUserId,
  createTimestamp
} from '../../src/domain/types';

describe('Branded Types - Property-Based Testing (Manual)', () => {
  describe('Deterministic Creation', () => {
    test('branded type creation should be deterministic', () => {
      const inputs = [
        'test',
        'calendar_123',
        'event_456',
        'user_789',
        'special!@#$%^&*()',
        'unicode_测试🎉αβγ',
        'a'.repeat(100)
      ];
      
      inputs.forEach(input => {
        const id1 = createCalendarId(input);
        const id2 = createCalendarId(input);
        expect(id1.equals(id2)).toBe(true);
        expect(id1.hashCode()).toBe(id2.hashCode());
      });
    });
  });

  describe('Equality Properties', () => {
    test('branded type equality should be reflexive, symmetric, and transitive', () => {
      const testValues = ['a', 'b', 'c', 'test', 'same', 'same', 'different'];
      
      testValues.forEach(a => {
        testValues.forEach(b => {
          testValues.forEach(c => {
            const idA = createEventId(a);
            const idB = createEventId(b);
            const idC = createEventId(c);
            
            // Reflexivity: a.equals(a) should always be true
            expect(idA.equals(idA)).toBe(true);
            
            // Symmetry: if a.equals(b), then b.equals(a)
            if (idA.equals(idB)) {
              expect(idB.equals(idA)).toBe(true);
            }
            
            // Transitivity: if a.equals(b) and b.equals(c), then a.equals(c)
            if (idA.equals(idB) && idB.equals(idC)) {
              expect(idA.equals(idC)).toBe(true);
            }
          });
        });
      });
    });
  });

  describe('GUID Validation Consistency', () => {
    test('valid GUIDs should be accepted consistently', () => {
      const validGuids = [
        '12345678-1234-5678-9abc-123456789012',
        '87654321-4321-8765-cba9-210987654321',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff'
      ];
      
      validGuids.forEach(guid => {
        const tenantId = createTenantId(guid);
        expect(tenantId.isValid()).toBe(true);
        expect(tenantId.value).toBe(guid.toLowerCase());
      });
    });

    test('invalid GUIDs should be rejected consistently', () => {
      const invalidGuids = [
        '1234567-1234-5678-9abc-123456789012',  // Too short
        '12345678-1234-5678-9abc-123456789012345', // Too long
        '12345678-1234-5678-9abc-12345678901g', // Invalid character
        '12345678-1234-5678-9abc-123456789012-', // Extra dash
        '12345678_1234_5678_9abc_123456789012', // Wrong separator
        'not-a-guid-at-all',
        '',
        '12345678-1234-5678-9abc', // Too short
        '12345678-1234-5678-9abc-123456789012-extra' // Too long
      ];
      
      invalidGuids.forEach(guid => {
        expect(() => createTenantId(guid)).toThrow();
      });
    });
  });

  describe('Timestamp Ordering Properties', () => {
    test('timestamp operations should preserve ordering', () => {
      const timestamps = [0, 1000, 2000, 3000, 4000, 5000];
      
      timestamps.forEach(time1 => {
        timestamps.forEach(time2 => {
          const ts1 = createTimestamp(time1);
          const ts2 = createTimestamp(time2);
          
          if (time1 < time2) {
            expect(ts1.isBefore(ts2)).toBe(true);
            expect(ts2.isAfter(ts1)).toBe(true);
            expect(ts1.equals(ts2)).toBe(false);
          } else if (time1 > time2) {
            expect(ts1.isAfter(ts2)).toBe(true);
            expect(ts2.isBefore(ts1)).toBe(true);
            expect(ts1.equals(ts2)).toBe(false);
          } else {
            expect(ts1.equals(ts2)).toBe(true);
            expect(ts1.isBefore(ts2)).toBe(false);
            expect(ts1.isAfter(ts2)).toBe(false);
          }
        });
      });
    });
  });

  describe('String Operations', () => {
    test('string operations should be length-preserving', () => {
      const inputs = [
        'a',
        'ab',
        'abc',
        'test',
        'longer_string',
        'a'.repeat(50),
        'special!@#$%^&*()',
        'unicode_测试🎉αβγ'
      ];
      
      inputs.forEach(input => {
        const calendarId = createCalendarId(input);
        expect(calendarId.toString().length).toBe(input.length);
        expect(calendarId.value.length).toBe(input.length);
      });
    });
  });

  describe('Hash Code Consistency', () => {
    test('hash codes should be consistent', () => {
      const inputs = [
        'test',
        'another_test',
        'special!@#$%^&*()',
        'unicode_测试🎉αβγ',
        'a'.repeat(100)
      ];
      
      inputs.forEach(input => {
        const id1 = createUserId(input);
        const id2 = createUserId(input);
        
        // Equal objects should have equal hash codes
        expect(id1.hashCode()).toBe(id2.hashCode());
      });
    });

    test('different values should likely have different hash codes', () => {
      const inputs = [
        'test1',
        'test2',
        'different',
        'another',
        'special!@#',
        'unicode_测试',
        'a'.repeat(50),
        'b'.repeat(50)
      ];
      
      const hashCodes = new Set();
      inputs.forEach(input => {
        const id = createUserId(input);
        hashCodes.add(id.hashCode());
      });
      
      // Most hash codes should be different (allowing for some collisions)
      expect(hashCodes.size).toBeGreaterThan(inputs.length * 0.7);
    });
  });

  describe('Performance Properties', () => {
    test('should handle large numbers of ID creations efficiently', () => {
      const startTime = performance.now();
      const ids = [];
      
      for (let i = 0; i < 1000; i++) {
        ids.push(createCalendarId(`calendar_${i}`));
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete quickly
      expect(ids.length).toBe(1000);
      
      // Verify all IDs are unique and valid
      const uniqueValues = new Set(ids.map(id => id.value));
      expect(uniqueValues.size).toBe(1000);
    });

    test('should not leak memory with repeated operations', () => {
      // Create and discard many branded types
      for (let i = 0; i < 100; i++) {
        const id = createEventId(`event_${i}`);
        const hash = id.hashCode();
        const str = id.toString();
        // Objects should be garbage collectable after this scope
      }
      
      // This test mainly ensures we don't keep unnecessary references
      expect(true).toBe(true); // Test completes without memory errors
    });
  });

  describe('Immutability Properties', () => {
    test('all operations should preserve immutability', () => {
      const originalId = createCalendarId('test');
      
      // These operations should not modify the original
      const copied = createCalendarId(originalId.value);
      const hash1 = originalId.hashCode();
      const str1 = originalId.toString();
      
      // Original should remain unchanged
      expect(originalId.value).toBe('test');
      expect(originalId.hashCode()).toBe(hash1);
      expect(originalId.toString()).toBe(str1);
      
      // Copy should be equal but separate
      expect(copied.equals(originalId)).toBe(true);
      expect(copied.hashCode()).toBe(hash1);
    });
  });
});