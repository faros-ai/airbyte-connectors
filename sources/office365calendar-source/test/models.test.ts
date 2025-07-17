import { VError } from 'verror';
import {
  Office365CalendarConfig,
  validateOffice365CalendarConfig,
  Calendar,
  Event,
  DeltaResponse,
  PagedResponse
} from '../src/models';

describe('O365CAL-002: Configuration and Models (TDD)', () => {
  describe('Office365CalendarConfig Validation', () => {
    describe('Required Fields', () => {
      test('should accept valid configuration with all required fields', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id'
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should reject configuration with missing client_id', () => {
        const config = {
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id'
        } as Office365CalendarConfig;
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow(VError);
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('client_id must not be an empty string');
      });

      test('should reject configuration with empty client_id', () => {
        const config: Office365CalendarConfig = {
          client_id: '',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id'
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('client_id must not be an empty string');
      });

      test('should reject configuration with whitespace-only client_id', () => {
        const config: Office365CalendarConfig = {
          client_id: '   ',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id'
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('client_id must not be an empty string');
      });

      test('should reject configuration with missing client_secret', () => {
        const config = {
          client_id: 'test-client-id',
          tenant_id: 'test-tenant-id'
        } as Office365CalendarConfig;
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('client_secret must not be an empty string');
      });

      test('should reject configuration with empty client_secret', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: '',
          tenant_id: 'test-tenant-id'
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('client_secret must not be an empty string');
      });

      test('should reject configuration with missing tenant_id', () => {
        const config = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret'
        } as Office365CalendarConfig;
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('tenant_id must not be an empty string');
      });

      test('should reject configuration with empty tenant_id', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: ''
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('tenant_id must not be an empty string');
      });
    });

    describe('Tenant ID Format Validation', () => {
      test('should accept valid GUID format tenant_id', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: '12345678-1234-1234-1234-123456789012'
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should accept valid domain format tenant_id', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'contoso.onmicrosoft.com'
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should accept subdomain format tenant_id', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'sub.domain.example.com'
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should reject invalid GUID format', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: '12345678-invalid-guid'
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('tenant_id must be a valid GUID or domain name');
      });

      test('should reject invalid domain format', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'not-a-domain'
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('tenant_id must be a valid GUID or domain name');
      });

      test('should reject single word tenant_id', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'contoso'
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('tenant_id must be a valid GUID or domain name');
      });
    });

    describe('Optional Fields Validation', () => {
      test('should accept configuration with calendar_ids array', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          calendar_ids: ['calendar1', 'calendar2', 'calendar3']
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should accept empty calendar_ids array', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          calendar_ids: []
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should accept domain_wide_delegation boolean true', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          domain_wide_delegation: true
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should accept domain_wide_delegation boolean false', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          domain_wide_delegation: false
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should validate events_max_results within valid range', () => {
        const validValues = [1, 100, 500, 1000, 2500];
        
        validValues.forEach(value => {
          const config: Office365CalendarConfig = {
            client_id: 'test-client-id',
            client_secret: 'test-client-secret',
            tenant_id: 'test-tenant-id',
            events_max_results: value
          };
          
          expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
        });
      });

      test('should reject events_max_results below minimum', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          events_max_results: 0
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('events_max_results must be between 1 and 2500');
      });

      test('should reject events_max_results above maximum', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          events_max_results: 2501
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('events_max_results must be between 1 and 2500');
      });

      test('should validate cutoff_days minimum value', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          cutoff_days: 1
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should accept large cutoff_days values', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          cutoff_days: 365
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
      });

      test('should reject cutoff_days below minimum', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          cutoff_days: 0
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('cutoff_days must be at least 1');
      });

      test('should reject negative cutoff_days', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id',
          cutoff_days: -1
        };
        
        expect(() => validateOffice365CalendarConfig(config))
          .toThrow('cutoff_days must be at least 1');
      });
    });

    describe('Configuration Defaults', () => {
      test('should work without any optional fields', () => {
        const config: Office365CalendarConfig = {
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          tenant_id: 'test-tenant-id'
        };
        
        expect(() => validateOffice365CalendarConfig(config)).not.toThrow();
        expect(config.calendar_ids).toBeUndefined();
        expect(config.domain_wide_delegation).toBeUndefined();
        expect(config.events_max_results).toBeUndefined();
        expect(config.cutoff_days).toBeUndefined();
      });
    });
  });

  describe('TypeScript Models', () => {
    describe('Calendar Interface', () => {
      test('should define Calendar interface with required fields', () => {
        const calendar: Calendar = {
          id: 'calendar-id',
          uid: 'calendar-id',
          name: 'My Calendar',
          description: 'Calendar description',
          owner: {
            name: 'John Doe',
            address: 'john@example.com',
            email: 'john@example.com'
          },
          canEdit: true,
          canShare: true,
          canViewPrivateItems: false,
          source: 'office365'
        };
        
        expect(calendar.id).toBe('calendar-id');
        expect(calendar.name).toBe('My Calendar');
        expect(calendar.owner.email).toBe('john@example.com');
      });
    });

    describe('Event Interface', () => {
      test('should define Event interface with required fields', () => {
        const event: Event = {
          id: 'event-id',
          uid: 'event-id',
          calendarUid: 'calendar-id',
          subject: 'Meeting Subject',
          title: 'Meeting Subject',
          description: 'Meeting content',
          body: {
            contentType: 'html',
            content: '<p>Meeting content</p>'
          },
          start: {
            dateTime: '2024-01-01T10:00:00',
            timeZone: 'UTC'
          },
          end: {
            dateTime: '2024-01-01T11:00:00',
            timeZone: 'UTC'
          },
          startTime: '2024-01-01T10:00:00',
          endTime: '2024-01-01T11:00:00',
          location: 'Conference Room A',
          attendees: [],
          organizer: {
            email: 'organizer@example.com',
            name: 'Organizer',
            emailAddress: {
              name: 'Organizer',
              address: 'organizer@example.com'
            }
          },
          categories: [],
          status: 'confirmed',
          showAs: 'busy',
          importance: 'normal',
          sensitivity: 'normal',
          isAllDay: false,
          isCancelled: false,
          createdAt: '2024-01-01T09:00:00Z',
          updatedAt: '2024-01-01T09:30:00Z',
          createdDateTime: '2024-01-01T09:00:00Z',
          lastModifiedDateTime: '2024-01-01T09:30:00Z',
          source: 'office365'
        };
        
        expect(event.subject).toBe('Meeting Subject');
        expect(event.start.dateTime).toBe('2024-01-01T10:00:00');
        expect(event.isAllDay).toBe(false);
      });
    });

    describe('DeltaResponse Interface', () => {
      test('should define DeltaResponse interface for incremental sync', () => {
        const deltaResponse: DeltaResponse = {
          id: 'event-delta-1',
          changeType: 'updated',
          changeKey: 'test-change-key',
          nextDeltaLink: 'https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=abc123'
        };
        
        expect(deltaResponse.id).toBe('event-delta-1');
        expect(deltaResponse.changeType).toBe('updated');
        expect(deltaResponse.changeKey).toBe('test-change-key');
      });
    });

    describe('PagedResponse Interface', () => {
      test('should define PagedResponse interface for pagination', () => {
        const pagedResponse: PagedResponse<Calendar> = {
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars?$skiptoken=xyz789',
          value: [
            {
              id: 'calendar-1',
              name: 'Calendar 1'
            } as Calendar,
            {
              id: 'calendar-2', 
              name: 'Calendar 2'
            } as Calendar
          ]
        };
        
        expect(pagedResponse['@odata.nextLink']).toContain('skiptoken=xyz789');
        expect(pagedResponse.value).toHaveLength(2);
        expect(pagedResponse.value[0].name).toBe('Calendar 1');
      });
    });
  });
});