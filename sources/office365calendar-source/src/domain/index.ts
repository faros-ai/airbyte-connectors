/**
 * Domain layer exports - All domain types and patterns.
 * 
 * This module provides a unified interface to all domain-specific types,
 * patterns, and utilities used throughout the Office 365 Calendar connector.
 * 
 * @module domain
 */

// Core patterns
export * from './types';
export * from './events';

// Re-export patterns for convenience
export { Result } from '../patterns/result';
export { Option } from '../patterns/option';

/**
 * Calendar domain object interface.
 * 
 * Represents a calendar in the domain model with strongly-typed identifiers
 * and comprehensive metadata.
 * 
 * @interface Calendar
 */
export interface Calendar {
  /** Unique identifier for the calendar */
  readonly id: import('./types').CalendarId;
  
  /** Display name of the calendar */
  readonly name: string;
  
  /** Owner of the calendar */
  readonly owner: string;
  
  /** Time zone identifier for the calendar */
  readonly timeZone: string;
  
  /** Optional description of the calendar */
  readonly description?: string;
  
  /** Optional color identifier for the calendar */
  readonly color?: string;
  
  /** Whether this is the default calendar for the user */
  readonly isDefault?: boolean;
  
  /** Whether the current user can edit this calendar */
  readonly canEdit?: boolean;
}