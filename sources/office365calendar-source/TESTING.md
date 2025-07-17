# Testing Guide

## Overview

This Office 365 Calendar connector has two types of tests:

1. **Unit Tests** - Fast, no external dependencies (always run in CI)
2. **Integration Tests** - Requires real Office 365 credentials (optional)

## Running Tests

### Unit Tests (Default)

```bash
# Run stable unit tests only (safe for CI)
npm test

# Run with coverage
npm run test-cov
```

This runs tests for:
- Domain logic (types, events, patterns)
- Architecture patterns (composition, dependency injection)
- Core functionality without external API calls

### All Tests (Including Integration)

```bash
# Run all tests (may fail without real credentials)
npm run test-all

# Run all tests with coverage
npm run test-cov-all
```

## Integration Testing with Real Office 365

To run integration tests against a real Office 365 tenant:

### 1. Set up Office 365 App Registration

1. Go to [Azure Portal](https://portal.azure.com) → App registrations
2. Create a new app registration
3. Grant these API permissions:
   - `Calendars.Read` or `Calendars.ReadWrite`
   - `User.Read` (for basic profile)
4. Create a client secret
5. Note down: Tenant ID, Client ID, Client Secret

### 2. Set Environment Variables

```bash
export INTEGRATION_TENANT_ID="your-tenant-id"
export INTEGRATION_CLIENT_ID="your-client-id"
export INTEGRATION_CLIENT_SECRET="your-client-secret"

# Optional: specify test user
export INTEGRATION_USER_ID="test-user@yourdomain.com"
```

### 3. Run Integration Tests

```bash
# Run all tests including integration
npm run test-all

# Or run only integration tests
npm test -- test/integration/
```

### Integration Test Coverage

The integration tests verify:
- Real Office 365 authentication
- Calendar discovery and access
- Event extraction and synchronization
- Error handling with real API responses
- Rate limiting and retry logic

## CI/CD Behavior

### GitHub Actions

- **Always runs**: Unit tests (`npm test`) 
- **Conditionally runs**: Integration tests (only if secrets are configured)

### Local Development

- **Default**: Unit tests only (`npm test`)
- **With credentials**: Full integration testing (`npm run test-all`)

This ensures:
✅ CI always passes with unit tests  
✅ Developers can optionally test against real APIs  
✅ No embarrassing CI failures due to missing credentials  

## Test Structure

```
test/
├── patterns/           # Functional programming patterns
├── domain/            # Domain logic and types
├── architecture/      # Composition and DI
├── integration/       # Real Office 365 API tests
├── streams/          # Stream implementation tests
├── error-handling/   # Error scenarios and retry logic
└── utils/            # Test utilities and helpers
```

## Troubleshooting

### "Missing environment variables" warnings
- **Expected behavior** - Integration tests skip automatically
- **Solution**: Either ignore (unit tests still run) or set up real credentials

### TypeScript compilation errors in test files
- Some test files have type mismatches due to evolving interfaces
- **Workaround**: Unit tests in `patterns/`, `domain/`, `architecture/` are stable

### Authentication failures in integration tests
- Verify your Office 365 app permissions
- Check that tenant/client IDs are correct
- Ensure client secret hasn't expired