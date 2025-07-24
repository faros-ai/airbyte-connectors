# O365CAL-006: Events Stream Incremental Sync Implementation

## User Story
As a user, I want incremental sync for calendar events so that subsequent syncs are faster and only fetch new or changed events since the last sync.

## Description
Implement incremental sync capability for the events stream using Microsoft Graph delta queries, matching the same behavior as Google Calendar's sync tokens.

## Acceptance Criteria
- [x] Events stream supports incremental sync mode
- [x] Delta queries implemented using Microsoft Graph API
- [x] State management works per calendar (same as Google Calendar)
- [x] Deleted events handled correctly via @removed annotations
- [x] Fallback to full refresh on invalid delta tokens
- [x] Cursor field management matches Google Calendar pattern

## Tasks
### ✅ Incremental Sync Setup - COMPLETED
- [x] Add `SyncMode.incremental` to events stream supported modes
- [x] Set cursor field: `"nextSyncToken"` (to match Google Calendar)
- [x] Implement state management per calendar ID
- [x] Handle stream state persistence and retrieval

### ✅ Delta Query Implementation - COMPLETED
- [x] Enhance API client with `getEventsIncremental()` method (delegates to office365calendar.ts)
- [x] Use Microsoft Graph delta endpoint: `/calendars/{calendarId}/events/delta`
- [x] Handle `@odata.deltaLink` for next sync iteration
- [x] Store delta links in stream state per calendar
- [x] Convert delta links to sync token format for consistency

### ✅ Incremental Logic - COMPLETED
- [x] Modify `readRecords()` to support incremental mode:
  - Check for existing state/delta link per calendar slice
  - Use `getEventsIncremental()` if delta link exists
  - Fall back to `getEvents()` for initial sync or when no state
- [x] Handle state updates after successful sync
- [x] Emit state messages per Airbyte protocol (via getUpdatedState method)

### ✅ Deleted Events Handling - COMPLETED
- [x] Process `@removed` annotations in delta responses
- [x] Mark deleted events appropriately in output
- [x] Handle event deletion vs. calendar removal scenarios
- [x] Ensure deleted events are tracked correctly

### ✅ Error Handling and Fallback - COMPLETED
- [x] Handle 410 "Gone" errors for expired delta tokens:
  - Clear stored state for affected calendar
  - Fall back to full refresh automatically
  - Log warning about delta token expiration
- [x] Handle delta query failures gracefully
- [x] Implement retry logic for transient delta query errors

### ✅ State Management - COMPLETED
- [x] Store delta link per calendar in stream state
- [x] Handle state serialization/deserialization
- [x] Manage state updates during multi-calendar sync
- [x] Ensure state consistency across sync failures

## Definition of Done ✅ ALL COMPLETED
- [x] Incremental sync mode works correctly
- [x] Delta queries fetch only changed events
- [x] State management persists across sync runs
- [x] Deleted events are handled correctly
- [x] Fallback to full refresh works for expired tokens
- [x] Incremental sync behavior matches Google Calendar exactly
- [x] Performance improvement over full refresh is measurable
- [x] Stream state follows Airbyte protocol

## Dependencies
- O365CAL-005 (Events Stream Basic)

## Estimate
8 story points