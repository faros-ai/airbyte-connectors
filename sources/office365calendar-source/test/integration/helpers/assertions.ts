/**
 * Enterprise-Grade Integration Test Assertions
 * 
 * Mathematical precision in validation with comprehensive error reporting.
 * Every assertion provides detailed failure context for rapid debugging.
 */

import { Calendar, Event, Office365CalendarConfig } from '../../../src/models';
import { Result } from '../../../src/models';

/**
 * Validation result for detailed error reporting.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Creates a successful validation result.
 */
export const validationSuccess = (): ValidationResult => ({
  valid: true,
  errors: [],
  warnings: []
});

/**
 * Creates a failed validation result with specific errors.
 */
export const validationFailure = (errors: string[], warnings: string[] = []): ValidationResult => ({
  valid: false,
  errors: Object.freeze([...errors]),
  warnings: Object.freeze([...warnings])
});

/**
 * Validates Office 365 Calendar structure and required fields.
 * 
 * Performs exhaustive validation against Google Calendar schema compatibility.
 * 
 * @param calendar - Calendar object to validate
 * @returns {ValidationResult} Detailed validation result
 */
export function validateCalendarStructure(calendar: Calendar): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!calendar.id || typeof calendar.id !== 'string') {
    errors.push('Calendar missing required field: id (string)');
  }

  if (!calendar.summary || typeof calendar.summary !== 'string') {
    errors.push('Calendar missing required field: summary (string)');
  }

  // Google Calendar compatibility fields
  if (calendar.time_zone && typeof calendar.time_zone !== 'string') {
    errors.push('Calendar time_zone must be string if present');
  }

  if (calendar.access_role && !['reader', 'writer', 'owner'].includes(calendar.access_role)) {
    warnings.push(`Calendar access_role '${calendar.access_role}' may not be compatible with Google Calendar schema`);
  }

  // Structure validation
  if (typeof calendar !== 'object' || calendar === null) {
    errors.push('Calendar must be a non-null object');
  }

  return errors.length > 0 ? validationFailure(errors, warnings) : validationSuccess();
}

/**
 * Validates Office 365 Event structure and required fields.
 * 
 * Ensures comprehensive compatibility with Google Calendar event schema.
 * 
 * @param event - Event object to validate
 * @returns {ValidationResult} Detailed validation result
 */
export function validateEventStructure(event: Event): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!event.id || typeof event.id !== 'string') {
    errors.push('Event missing required field: id (string)');
  }

  if (!event.summary || typeof event.summary !== 'string') {
    errors.push('Event missing required field: summary (string)');
  }

  // DateTime validation
  if (!event.start || !event.start.date_time) {
    errors.push('Event missing required start.date_time');
  } else {
    const startDate = new Date(event.start.date_time);
    if (isNaN(startDate.getTime())) {
      errors.push('Event start.date_time is not a valid ISO 8601 date');
    }
  }

  if (!event.end || !event.end.date_time) {
    errors.push('Event missing required end.date_time');
  } else {
    const endDate = new Date(event.end.date_time);
    if (isNaN(endDate.getTime())) {
      errors.push('Event end.date_time is not a valid ISO 8601 date');
    }
  }

  // Time ordering validation
  if (event.start?.date_time && event.end?.date_time) {
    const start = new Date(event.start.date_time);
    const end = new Date(event.end.date_time);
    
    if (start >= end) {
      errors.push('Event start time must be before end time');
    }
  }

  // Attendees validation
  if (event.attendees) {
    if (!Array.isArray(event.attendees)) {
      errors.push('Event attendees must be an array if present');
    } else {
      event.attendees.forEach((attendee, index) => {
        if (!attendee.email || typeof attendee.email !== 'string') {
          errors.push(`Event attendee[${index}] missing required email field`);
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee.email)) {
          warnings.push(`Event attendee[${index}] email '${attendee.email}' may not be valid format`);
        }
      });
    }
  }

  return errors.length > 0 ? validationFailure(errors, warnings) : validationSuccess();
}

/**
 * Validates that calendar data meets expected count and structure requirements.
 * 
 * @param calendars - Array of calendars to validate
 * @param expectedCount - Expected number of calendars (optional)
 * @returns {ValidationResult} Validation result with detailed feedback
 */
export function validateCalendarDataset(
  calendars: Calendar[], 
  expectedCount?: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(calendars)) {
    errors.push('Calendars must be an array');
    return validationFailure(errors);
  }

  if (expectedCount !== undefined && calendars.length !== expectedCount) {
    warnings.push(`Expected ${expectedCount} calendars, got ${calendars.length}`);
  }

  // Validate each calendar structure
  calendars.forEach((calendar, index) => {
    const result = validateCalendarStructure(calendar);
    if (!result.valid) {
      errors.push(...result.errors.map(err => `Calendar[${index}]: ${err}`));
      warnings.push(...result.warnings.map(warn => `Calendar[${index}]: ${warn}`));
    }
  });

  // Check for duplicate calendar IDs
  const calendarIds = calendars.map(cal => cal.id);
  const uniqueIds = new Set(calendarIds);
  if (uniqueIds.size !== calendarIds.length) {
    errors.push('Duplicate calendar IDs detected in dataset');
  }

  return errors.length > 0 ? validationFailure(errors, warnings) : validationSuccess();
}

/**
 * Validates that event data meets expected count and structure requirements.
 * 
 * @param events - Array of events to validate
 * @param expectedCount - Expected number of events (optional)
 * @returns {ValidationResult} Validation result with detailed feedback
 */
export function validateEventDataset(
  events: Event[], 
  expectedCount?: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(events)) {
    errors.push('Events must be an array');
    return validationFailure(errors);
  }

  if (expectedCount !== undefined && events.length !== expectedCount) {
    warnings.push(`Expected ${expectedCount} events, got ${events.length}`);
  }

  // Validate each event structure
  events.forEach((event, index) => {
    const result = validateEventStructure(event);
    if (!result.valid) {
      errors.push(...result.errors.map(err => `Event[${index}]: ${err}`));
      warnings.push(...result.warnings.map(warn => `Event[${index}]: ${warn}`));
    }
  });

  // Check for duplicate event IDs
  const eventIds = events.map(evt => evt.id);
  const uniqueIds = new Set(eventIds);
  if (uniqueIds.size !== eventIds.length) {
    errors.push('Duplicate event IDs detected in dataset');
  }

  return errors.length > 0 ? validationFailure(errors, warnings) : validationSuccess();
}

/**
 * Validates authentication configuration completeness.
 * 
 * @param config - Configuration to validate
 * @returns {ValidationResult} Validation result
 */
export function validateAuthConfiguration(config: Office365CalendarConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.tenant_id || typeof config.tenant_id !== 'string') {
    errors.push('Missing or invalid tenant_id');
  }

  if (!config.client_id || typeof config.client_id !== 'string') {
    errors.push('Missing or invalid client_id');
  }

  if (!config.client_secret || typeof config.client_secret !== 'string') {
    errors.push('Missing or invalid client_secret');
  }

  // Validate GUID format for tenant_id (if it's not a domain)
  const tenantId = config.tenant_id as string;
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.onmicrosoft\.com$/;
  
  if (!guidRegex.test(tenantId) && !domainRegex.test(tenantId)) {
    warnings.push('tenant_id should be either a GUID or domain format (e.g., contoso.onmicrosoft.com)');
  }

  return errors.length > 0 ? validationFailure(errors, warnings) : validationSuccess();
}

/**
 * Validates Result<T,E> pattern usage and error handling.
 * 
 * @param result - Result object to validate
 * @param expectSuccess - Whether to expect success or failure
 * @returns {ValidationResult} Validation result
 */
export function validateResultPattern<T>(
  result: Result<T>, 
  expectSuccess: boolean = true
): ValidationResult {
  const errors: string[] = [];

  if (typeof result !== 'object' || result === null) {
    errors.push('Result must be a non-null object');
    return validationFailure(errors);
  }

  if (typeof result.success !== 'boolean') {
    errors.push('Result.success must be a boolean');
  }

  if (expectSuccess) {
    if (!result.success) {
      errors.push(`Expected successful result, got failure: ${result.error || 'unknown error'}`);
    } else if (!('data' in result)) {
      errors.push('Successful result must have data property');
    }
  } else {
    if (result.success) {
      errors.push('Expected failed result, got success');
    } else if (!('error' in result)) {
      errors.push('Failed result must have error property');
    }
  }

  return errors.length > 0 ? validationFailure(errors) : validationSuccess();
}

/**
 * Performance metrics for operation validation.
 */
export interface PerformanceMetrics {
  readonly duration: number; // milliseconds
  readonly memoryUsed: number; // bytes
  readonly itemsProcessed: number;
}

/**
 * Validates performance metrics against expected thresholds.
 * 
 * @param metrics - Performance metrics to validate
 * @param thresholds - Expected performance thresholds
 * @returns {ValidationResult} Performance validation result
 */
export function validatePerformanceMetrics(
  metrics: PerformanceMetrics,
  thresholds: {
    maxDuration?: number;
    maxMemoryMB?: number;
    minThroughput?: number; // items per second
  }
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (thresholds.maxDuration && metrics.duration > thresholds.maxDuration) {
    errors.push(`Operation took ${metrics.duration}ms, exceeded maximum ${thresholds.maxDuration}ms`);
  }

  if (thresholds.maxMemoryMB) {
    const memoryMB = metrics.memoryUsed / (1024 * 1024);
    if (memoryMB > thresholds.maxMemoryMB) {
      errors.push(`Memory usage ${memoryMB.toFixed(2)}MB exceeded maximum ${thresholds.maxMemoryMB}MB`);
    }
  }

  if (thresholds.minThroughput && metrics.duration > 0) {
    const throughput = (metrics.itemsProcessed / metrics.duration) * 1000; // items per second
    if (throughput < thresholds.minThroughput) {
      warnings.push(`Throughput ${throughput.toFixed(2)} items/sec below expected ${thresholds.minThroughput} items/sec`);
    }
  }

  return errors.length > 0 ? validationFailure(errors, warnings) : validationSuccess();
}