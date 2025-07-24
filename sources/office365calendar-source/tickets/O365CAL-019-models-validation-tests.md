# O365CAL-019: Enable Models Validation Tests (MEDIUM-HIGH IMPACT)

## Objective
Enable and fix the disabled `test/models.test.ts` test suite to boost coverage of core data models and type validation.

**Current**: `models.ts` coverage at 58.9%  
**Target**: >80% coverage  
**Estimated Impact**: +10-15% overall coverage

## Background
The models.test.ts contains comprehensive validation for:
- Event model with Google Calendar compatibility fields
- Calendar model type definitions  
- Branded types (TenantId, CalendarId, etc.)
- Configuration object validation

Current error: Event model missing required 'summary' field.

## Tasks

### Phase 1: Enable Test Suite
- [ ] Remove `test/models.test.ts` from testPathIgnorePatterns in package.json
- [ ] Run initial test to identify all compilation errors
- [ ] Catalog specific TypeScript issues

### Phase 2: Fix Event Model Issues
- [ ] Fix Event model `summary` field requirement in test objects
- [ ] Ensure Event test objects include all required Google Calendar compatibility fields
- [ ] Update EventDateTime and Attendee type test objects
- [ ] Fix start/end time format requirements (dateTime + date_time, timeZone + time_zone)

### Phase 3: Fix Calendar Model Issues  
- [ ] Update Calendar test objects to match full Calendar interface
- [ ] Fix owner, access_role, and other required fields
- [ ] Ensure Google Calendar compatibility field mapping

### Phase 4: Fix Branded Type Tests
- [ ] Validate TenantId, CalendarId, UserId branded type creation
- [ ] Test GUID validation and formatting
- [ ] Test type safety and compile-time guarantees

### Phase 5: Configuration Validation
- [ ] Test Office365CalendarConfig object validation
- [ ] Test required vs optional field validation
- [ ] Test configuration transformation and sanitization

## Technical Details

### Key Error to Fix
```typescript
// Current error: Property 'summary' is missing in type Event
const event: Event = {
  id: 'event-1',
  subject: 'Meeting', 
  // Missing: summary: 'Meeting' ← ADD THIS
  // ... other fields
}
```

### Required Google Calendar Compatibility Fields
```typescript
// Event requires both formats for compatibility:
start: {
  dateTime: '2024-01-15T10:00:00Z',
  date_time: '2024-01-15T10:00:00Z',  // ← Required for Google Calendar compat
  timeZone: 'UTC',
  time_zone: 'UTC'                     // ← Required for Google Calendar compat
}
```

## Files to Modify
- `package.json` - Remove from testPathIgnorePatterns
- `test/models.test.ts` - Fix Event/Calendar object creation
- `src/models.ts` - Verify model definitions if needed

## Success Criteria
- [ ] All tests in models.test.ts passing
- [ ] models.ts coverage >80%
- [ ] Overall test coverage >70%
- [ ] Event and Calendar model validation working
- [ ] Branded type validation working
- [ ] Configuration validation working

## Dependencies
- Part of O365CAL-017 Test Coverage Epic
- Should be completed after O365CAL-018 for maximum impact stacking

## Estimated Time
1-2 hours (model fixes are typically straightforward)