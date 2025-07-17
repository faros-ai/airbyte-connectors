import * as fs from 'fs-extra';
import * as path from 'path';
import { AirbyteSpec } from 'faros-airbyte-cdk';

describe('O365CAL-002: Configuration Specification (TDD)', () => {
  const specPath = path.join(__dirname, '../resources/spec.json');
  
  describe('spec.json validation', () => {
    test('spec.json file should exist', () => {
      expect(fs.existsSync(specPath)).toBe(true);
    });

    test('spec.json should be valid JSON', () => {
      expect(() => {
        const content = fs.readFileSync(specPath, 'utf8');
        JSON.parse(content);
      }).not.toThrow();
    });

    test('should have correct documentationUrl', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      expect(spec.documentationUrl).toBe('https://docs.faros.ai');
    });

    test('should have correct title', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      expect(spec.connectionSpecification.title).toBe('Office 365 Calendar Spec');
    });

    test('should define required fields correctly', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const required = spec.connectionSpecification.required;
      
      expect(required).toContain('client_id');
      expect(required).toContain('client_secret');
      expect(required).toContain('tenant_id');
      expect(required).not.toContain('client_email');
      expect(required).not.toContain('private_key');
    });

    test('should have client_id field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const clientId = spec.connectionSpecification.properties.client_id;
      
      expect(clientId.type).toBe('string');
      expect(clientId.title).toBe('Client ID');
      expect(clientId.description).toContain('Azure AD application');
      expect(clientId.airbyte_secret).toBeFalsy();
    });

    test('should have client_secret field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const clientSecret = spec.connectionSpecification.properties.client_secret;
      
      expect(clientSecret.type).toBe('string');
      expect(clientSecret.title).toBe('Client Secret');
      expect(clientSecret.description).toContain('client secret');
      expect(clientSecret.airbyte_secret).toBe(true);
    });

    test('should have tenant_id field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const tenantId = spec.connectionSpecification.properties.tenant_id;
      
      expect(tenantId.type).toBe('string');
      expect(tenantId.title).toBe('Tenant ID');
      expect(tenantId.description).toContain('Azure AD tenant');
      expect(tenantId.examples).toContain('12345678-1234-1234-1234-123456789012');
      expect(tenantId.examples).toContain('contoso.onmicrosoft.com');
    });

    test('should have calendar_ids field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const calendarIds = spec.connectionSpecification.properties.calendar_ids;
      
      expect(calendarIds.type).toBe('array');
      expect(calendarIds.items.type).toBe('string');
      expect(calendarIds.title).toBe('Calendar IDs');
      expect(calendarIds.description).toContain('Calendar IDs');
      expect(calendarIds.description).toContain('default');
      expect(calendarIds.default).toBeUndefined();
    });

    test('should have domain_wide_delegation field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const domainWide = spec.connectionSpecification.properties.domain_wide_delegation;
      
      expect(domainWide.type).toBe('boolean');
      expect(domainWide.title).toBe('Enable Domain-wide Delegation');
      expect(domainWide.description).toContain('application permissions');
      expect(domainWide.description).toContain('organization');
      expect(domainWide.default).toBe(false);
    });

    test('should have events_max_results field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const eventsMax = spec.connectionSpecification.properties.events_max_results;
      
      expect(eventsMax.type).toBe('integer');
      expect(eventsMax.title).toBe('Events Max Results');
      expect(eventsMax.description).toContain('Maximum number of events');
      expect(eventsMax.default).toBe(500);
      expect(eventsMax.minimum).toBe(1);
      expect(eventsMax.maximum).toBe(2500);
    });

    test('should have cutoff_days field with correct properties', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const cutoffDays = spec.connectionSpecification.properties.cutoff_days;
      
      expect(cutoffDays.type).toBe('integer');
      expect(cutoffDays.title).toBe('Cutoff Days');
      expect(cutoffDays.description).toContain('Fetch events created within');
      expect(cutoffDays.default).toBe(90);
      expect(cutoffDays.minimum).toBe(1);
    });

    test('should not have Google-specific fields', () => {
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      const properties = spec.connectionSpecification.properties;
      
      expect(properties.client_email).toBeUndefined();
      expect(properties.private_key).toBeUndefined();
    });

    test('should be loadable by AirbyteSpec', () => {
      const specContent = JSON.parse(fs.readFileSync(specPath, 'utf8'));
      expect(() => new AirbyteSpec(specContent)).not.toThrow();
    });
  });

  describe('Schema files validation', () => {
    const schemasPath = path.join(__dirname, '../resources/schemas');

    test('calendars.json should exist', () => {
      const calendarSchemaPath = path.join(schemasPath, 'calendars.json');
      expect(fs.existsSync(calendarSchemaPath)).toBe(true);
    });

    test('calendars.json should be valid JSON schema', () => {
      const calendarSchemaPath = path.join(schemasPath, 'calendars.json');
      const schema = JSON.parse(fs.readFileSync(calendarSchemaPath, 'utf8'));
      
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    test('calendars schema should map Office 365 fields correctly', () => {
      const calendarSchemaPath = path.join(schemasPath, 'calendars.json');
      const schema = JSON.parse(fs.readFileSync(calendarSchemaPath, 'utf8'));
      
      // Should have Google Calendar compatible fields
      expect(schema.properties.id).toBeDefined();
      expect(schema.properties.summary).toBeDefined(); // Maps from 'name'
      expect(schema.properties.description).toBeDefined();
      
      // Should not have Office 365 specific field names
      expect(schema.properties.name).toBeUndefined();
    });

    test('events.json should exist', () => {
      const eventSchemaPath = path.join(schemasPath, 'events.json');
      expect(fs.existsSync(eventSchemaPath)).toBe(true);
    });

    test('events.json should be valid JSON schema', () => {
      const eventSchemaPath = path.join(schemasPath, 'events.json');
      const schema = JSON.parse(fs.readFileSync(eventSchemaPath, 'utf8'));
      
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    test('events schema should map Office 365 fields correctly', () => {
      const eventSchemaPath = path.join(schemasPath, 'events.json');
      const schema = JSON.parse(fs.readFileSync(eventSchemaPath, 'utf8'));
      
      // Should have Google Calendar compatible fields
      expect(schema.properties.id).toBeDefined();
      expect(schema.properties.summary).toBeDefined(); // Maps from 'subject'
      expect(schema.properties.description).toBeDefined(); // Maps from 'body.content'
      expect(schema.properties.start).toBeDefined();
      expect(schema.properties.end).toBeDefined();
      expect(schema.properties.attendees).toBeDefined();
      expect(schema.properties.organizer).toBeDefined();
      expect(schema.properties.location).toBeDefined();
      
      // Should include incremental sync field
      expect(schema.properties.nextSyncToken).toBeDefined();
      
      // Should not have Office 365 specific field names
      expect(schema.properties.subject).toBeUndefined();
      expect(schema.properties.body).toBeUndefined();
    });
  });
});