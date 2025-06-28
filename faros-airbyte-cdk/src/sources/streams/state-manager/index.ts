/**
 * Generic State Manager System for Airbyte Streams
 * 
 * This module provides a flexible and type-safe state management system
 * for incremental sync streams, eliminating code duplication and 
 * providing consistent state handling patterns.
 */

export * from './interfaces';
export * from './timestamp-state-manager';
export * from './field-extractors';
export * from './key-generators';
export * from './factory';