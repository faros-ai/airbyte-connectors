# O365CAL-018: Enable Office365Calendar Core Tests (HIGH IMPACT)

## Objective
Enable and fix the disabled `test/office365calendar.test.ts` test suite to dramatically boost coverage of the core SDK implementation.

**Current**: `office365calendar-sdk.ts` coverage at 2.65%  
**Target**: >50% coverage  
**Estimated Impact**: +25-30% overall coverage

## Background
The office365calendar.test.ts is currently disabled in testPathIgnorePatterns but contains comprehensive tests for the core Microsoft Graph API client implementation. This is the biggest opportunity for coverage improvement.

## Tasks

### Phase 1: Enable Test Suite
- [ ] Remove `test/office365calendar.test.ts` from testPathIgnorePatterns in package.json
- [ ] Run initial test to identify compilation errors
- [ ] Document all TypeScript and runtime errors

### Phase 2: Fix TypeScript Issues
- [ ] Fix mock object type mismatches (similar to events stream fix)
- [ ] Update API method signatures to match current implementation
- [ ] Fix authentication flow mocking
- [ ] Update Microsoft Graph client mocking

### Phase 3: Fix Test Logic
- [ ] Update test assertions to match current API behavior
- [ ] Fix async/await patterns in test cases
- [ ] Update expected response formats
- [ ] Fix timeout and error handling test scenarios

### Phase 4: Coverage Validation
- [ ] Run coverage report to verify improvement
- [ ] Ensure office365calendar-sdk.ts coverage >50%
- [ ] Verify overall coverage increase >20%
- [ ] Fix any remaining coverage gaps

## Technical Approach
Follow the proven pattern from events stream fix:
1. **Enable test** → **Fix TypeScript errors** → **Update assertions** → **Massive coverage boost**
2. Use existing mock helper functions from test-helpers.ts
3. Update mock objects to match full interface requirements
4. Minimal overrides in mock object creation

## Files to Modify
- `package.json` - Remove from testPathIgnorePatterns
- `test/office365calendar.test.ts` - Fix all compilation and logic errors
- `test/utils/test-helpers.ts` - Add any missing helper functions

## Success Criteria
- [ ] All tests in office365calendar.test.ts passing
- [ ] office365calendar-sdk.ts coverage >50%
- [ ] Overall test coverage >60%
- [ ] No TypeScript compilation errors
- [ ] CI pipeline passing

## Risk Assessment
**Low Risk** - Following proven pattern from events stream success. Same technical approach with established mock helpers.

## Dependencies
- Part of O365CAL-017 Test Coverage Epic
- Builds on successful events stream enablement pattern

## Estimated Time
2-3 hours (based on events stream fix experience)