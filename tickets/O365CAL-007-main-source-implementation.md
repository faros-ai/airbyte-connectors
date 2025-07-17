# O365CAL-007: Main Source Class and Entry Point Implementation

## User Story
As a developer, I want to integrate all stream implementations into a main source class so that the connector can be used with Airbyte's protocol and CLI.

## Description
Implement the main source class that orchestrates calendars and events streams, provides connection validation, and serves as the entry point for the Office 365 Calendar connector.

## Acceptance Criteria
- [x] Main source class extends AirbyteSourceBase correctly
- [x] Connection validation works with Microsoft Graph API
- [x] Both calendars and events streams are properly exposed
- [x] CLI entry point functions correctly
- [x] Stream filtering and configuration validation implemented
- [x] Source follows the same patterns as Google Calendar connector

## Tasks
### ✅ Source Class Implementation - COMPLETED
- [x] Create main `Office365CalendarSource` class in `src/index.ts`
- [x] Extend `AirbyteSourceBase<Office365CalendarConfig>`
- [x] Set source type: `"office365-calendar"`
- [x] Implement required abstract methods:
  - `spec()`: Return configuration specification
  - `checkConnection()`: Validate connection using API client
  - `streams()`: Return array of calendars and events streams

### ✅ Connection Validation - COMPLETED
- [x] Implement `checkConnection()` method:
  - Create API client instance with provided config
  - Test connection with simple Graph API call (e.g., get calendars)
  - Return `[boolean, VError]` tuple following CDK pattern
  - Provide clear error messages for common failure scenarios

### ✅ Stream Management - COMPLETED
- [x] Implement `streams()` method:
  - Return instances of both Calendars and Events streams
  - Pass configuration and logger to stream constructors
  - Ensure streams are properly initialized

### ✅ Configuration Handling - COMPLETED
- [x] Add configuration validation for required fields
- [x] Provide helpful error messages for misconfiguration
- [x] Verify access to specific calendars when configured
- [x] Handle domain-wide delegation scenarios

### ✅ Entry Point Setup - COMPLETED
- [x] Create `mainCommand()` function for CLI entry point:
  - Initialize AirbyteSourceLogger
  - Create Office365CalendarSource instance
  - Use AirbyteSourceRunner for command handling
  - Follow exact pattern from Google Calendar connector

### ✅ Stream Integration - COMPLETED
- [x] Create `src/streams/index.ts`:
  - Export Calendars and Events stream classes
  - Provide clean imports for main source file
- [x] Ensure proper dependency injection between components
- [x] Verify all configurations flow correctly to streams

### ✅ Error Handling - COMPLETED
- [x] Add comprehensive error handling for source initialization
- [x] Handle configuration validation errors clearly
- [x] Provide troubleshooting guidance in error messages
- [x] Log important events and errors appropriately

## Definition of Done ✅ ALL COMPLETED
- [x] Source class compiles without errors
- [x] Connection validation works with valid/invalid credentials
- [x] Both streams are accessible and functional
- [x] CLI entry point works correctly
- [x] Error messages are clear and actionable
- [x] Source integrates properly with Airbyte CDK
- [x] Configuration validation prevents common mistakes
- [x] Logging provides useful debugging information

## Dependencies
- O365CAL-006 (Incremental Sync)

## Estimate
5 story points