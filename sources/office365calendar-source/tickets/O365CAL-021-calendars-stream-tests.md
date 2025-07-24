# O365CAL-021: Enable Calendars Stream Tests (MEDIUM IMPACT)

## Objective
Fix and enable the `test/streams/calendars.test.ts` test suite to boost coverage of the calendars stream implementation.

**Current**: `calendars.ts` coverage at 8.47%  
**Target**: >55% coverage  
**Estimated Impact**: +8-12% overall coverage

## Background
The calendars stream test exists but has TypeScript compilation errors similar to the events stream. The calendars stream is critical for Office 365 calendar discovery and permission handling.

## Tasks

### Phase 1: Fix TypeScript Issues
- [ ] Fix Calendar mock object type mismatches
- [ ] Update mock calendars to include all required fields (uid, summary, source)
- [ ] Use createMockCalendar helper function consistently
- [ ] Fix async generator type definitions

### Phase 2: Fix Stream Configuration Tests
- [ ] Verify stream name and primary key assertions
- [ ] Update supported sync modes (may now include incremental)
- [ ] Test JSON schema loading and validation
- [ ] Test stream slice generation

### Phase 3: Test Calendar Data Fetching
- [ ] Test fetching calendars with different permission levels
- [ ] Test calendar filtering based on configuration
- [ ] Test domain delegation scenarios
- [ ] Test calendar access error handling
- [ ] Test empty calendar list scenarios

### Phase 4: Test Data Mapping
- [ ] Test Office 365 → Google Calendar schema transformation
- [ ] Test calendar permission mapping (owner, reader, writer)
- [ ] Test calendar metadata extraction
- [ ] Test time zone handling

### Phase 5: Test Error Scenarios
- [ ] Test permission denied for specific calendars
- [ ] Test authentication failures
- [ ] Test rate limiting scenarios
- [ ] Test malformed calendar data handling

## Technical Details

### Key Error Pattern (from logs)
```typescript
// Current error: Missing properties from Calendar type
yield {
  id: 'calendar-1', 
  name: 'Primary Calendar'
  // Missing: uid, summary, source
};

// Fix: Use createMockCalendar helper
yield createMockCalendar({
  id: 'calendar-1',
  name: 'Primary Calendar'
});
```

### Calendar Interface Requirements
```typescript
interface Calendar {
  id: string;
  uid: string;           // ← Required
  name: string;
  summary: string;       // ← Required  
  source: string;        // ← Required ('office365')
  // ... other fields
}
```

## Files to Modify
- `test/streams/calendars.test.ts` - Fix all TypeScript and logic errors
- `test/utils/test-helpers.ts` - Verify createMockCalendar helper is complete

## Success Criteria
- [ ] All tests in calendars.test.ts passing
- [ ] calendars.ts coverage >55%
- [ ] Overall test coverage >85%
- [ ] Calendar stream slicing working
- [ ] Calendar data mapping tested
- [ ] Error handling scenarios covered

## Technical Approach
Follow the proven pattern from events stream fix:
1. Replace manual mock objects with createMockCalendar() calls
2. Minimal overrides in mock creation
3. Fix TypeScript type mismatches systematically
4. Update assertions to match current implementation

## Dependencies
- Part of O365CAL-017 Test Coverage Epic
- Should be completed after O365CAL-018, O365CAL-019, and O365CAL-020
- Uses same patterns as successful events stream fix

## Risk Assessment
**Low Risk** - Following established pattern from events stream success.

## Estimated Time
1-2 hours (similar to events stream fix complexity)