# Office 365 Calendar Integration Tests

## Enterprise-Grade Testing with Mathematical Precision 🚀

This integration test suite validates the Office 365 Calendar connector with real Microsoft Graph API endpoints, ensuring production-ready reliability and performance.

## 🎯 Test Coverage

### Phase 1: Authentication Tests (`01-authentication.test.ts`)
- **OAuth2 Flow Validation**: Real Azure AD token acquisition
- **Token Caching**: Efficient credential management
- **Security Validation**: No credential exposure in logs
- **Error Handling**: Invalid tenant/client scenarios
- **Performance**: Authentication within 5-second threshold

### Phase 2: Calendar Discovery Tests (`02-calendar-discovery.test.ts`)  
- **Calendar Enumeration**: Real Microsoft Graph calendar discovery
- **Schema Mapping**: Office 365 → Google Calendar compatibility
- **Permission Handling**: Different access levels and ownership
- **Filtering**: Specific calendar ID configuration
- **Performance**: Memory-efficient streaming

### Phase 3: Event Extraction Tests (`03-event-extraction.test.ts`)
- **Event Data Integrity**: Complete metadata extraction
- **Schema Compliance**: Google Calendar event format
- **DateTime Handling**: Timezone preservation and all-day events
- **Attendee Information**: Meeting participant details
- **Performance**: Large dataset processing

### Phase 4: Incremental Sync Tests (`04-incremental-sync.test.ts`)
- **Delta Query Implementation**: Changed-only synchronization
- **State Management**: Persistent sync tokens
- **Change Detection**: Create/Update/Delete operations
- **Fallback Logic**: Full refresh on token expiration
- **Performance**: Efficiency gains over full refresh

### Phase 5: Error Scenario Tests (`05-error-scenarios.test.ts`)
- **Network Resilience**: Timeout and retry handling
- **Rate Limiting**: Microsoft Graph throttling
- **Permission Errors**: Graceful access denial
- **Data Corruption**: Malformed API responses
- **Recovery Mechanisms**: Automatic error recovery

## 🛠️ Setup Instructions

### 1. Environment Configuration

Copy the environment template:
```bash
cp test/integration/fixtures/environment-template.env test/integration/.env
```

Edit `.env` with your Azure AD credentials:
```bash
# Required
INTEGRATION_TENANT_ID=your-tenant-id
INTEGRATION_CLIENT_ID=your-client-id
INTEGRATION_CLIENT_SECRET=your-client-secret

# Optional
INTEGRATION_DOMAIN_WIDE=false
INTEGRATION_EVENTS_MAX_RESULTS=100
INTEGRATION_CUTOFF_DAYS=30
```

### 2. Azure AD App Registration

1. **Create App**: Azure Portal → App registrations → New registration
2. **Note IDs**: Copy Application (client) ID and Directory (tenant) ID
3. **Generate Secret**: Certificates & secrets → New client secret
4. **Set Permissions**: API permissions → Microsoft Graph → Application permissions:
   - `Calendars.Read` (or `Calendars.Read.All` for org-wide)
   - `User.Read` (or `User.Read.All` for org-wide)
5. **Grant Consent**: Click "Grant admin consent"

### 3. Test Data Preparation

**Option A: Use Existing Data**
- Update `INTEGRATION_KNOWN_CALENDAR_IDS` with real calendar IDs
- Update `INTEGRATION_EXPECTED_EVENT_COUNTS` with actual counts

**Option B: Create Test Data** 
- Create dedicated test calendars in your tenant
- Add predictable test events
- Note calendar IDs and event counts

## 🚀 Running Tests

### All Integration Tests
```bash
npm test -- --testNamePattern="Integration"
```

### Specific Phase
```bash
npm test -- test/integration/01-authentication.test.ts
npm test -- test/integration/02-calendar-discovery.test.ts
npm test -- test/integration/03-event-extraction.test.ts
npm test -- test/integration/04-incremental-sync.test.ts
npm test -- test/integration/05-error-scenarios.test.ts
```

### With Verbose Output
```bash
npm test -- --testNamePattern="Integration" --verbose
```

### Performance Testing
```bash
npm test -- --testNamePattern="Performance" --runInBand
```

## 📊 Expected Results

### Successful Test Run
```
Integration Phase 1: Authentication Tests
  ✓ should authenticate with valid credentials (2.3s)
  ✓ should cache access tokens efficiently (0.1s)
  ✓ should handle token refresh gracefully (1.8s)

Integration Phase 2: Calendar Discovery Tests  
  ✓ should discover and list accessible calendars (1.5s)
  ✓ should map Office 365 fields to Google Calendar schema (0.8s)
  ✓ should handle calendar filtering (1.2s)

Integration Phase 3: Event Extraction Tests
  ✓ should extract events from accessible calendars (3.1s)
  ✓ should handle events with different complexity levels (2.4s)
  ✓ should preserve timezone information (1.6s)

Test Suites: 3 passed, 3 total
Tests: 15 passed, 15 total
Time: 18.742s
```

### Performance Benchmarks
- **Authentication**: < 5 seconds
- **Calendar Discovery**: < 2 seconds per 10 calendars
- **Event Extraction**: < 5 seconds per 100 events
- **Memory Usage**: < 200MB for typical workloads
- **API Efficiency**: < 10 requests per operation

## 🔧 Troubleshooting

### Tests Skip with "environment not configured"
- Verify `.env` file exists in `test/integration/`
- Check all required environment variables are set
- Validate Azure AD credentials are correct

### Authentication Failures
- Verify tenant ID format (GUID or domain)
- Check client secret hasn't expired
- Ensure API permissions are granted with admin consent
- Confirm app registration is enabled

### Permission Errors
- Verify Microsoft Graph permissions:
  - `Calendars.Read` or `Calendars.Read.All`
  - `User.Read` or `User.Read.All`
- Check admin consent is granted
- Confirm service principal is enabled

### Network/Timeout Issues
- Increase `INTEGRATION_TIMEOUT_MS` if needed
- Check corporate firewall/proxy settings
- Verify Microsoft Graph endpoints are accessible
- Test with reduced dataset sizes

### Performance Issues
- Reduce `INTEGRATION_EVENTS_MAX_RESULTS`
- Limit `INTEGRATION_CUTOFF_DAYS` 
- Use specific calendar IDs instead of discovery
- Enable only essential test scenarios

## 🛡️ Security Best Practices

### Credential Management
- **Never commit** `.env` files to version control
- **Use dedicated test tenant** - not production
- **Rotate secrets** regularly (every 6-12 months)
- **Monitor usage** in Azure AD sign-in logs

### Test Isolation
- **Read-only operations** by default
- **Destructive tests** only when `INTEGRATION_ENABLE_DESTRUCTIVE_TESTS=true`
- **Isolated test data** separate from production
- **Cleanup procedures** for any test modifications

### Network Security
- **HTTPS only** - all SDK communications encrypted
- **IP restrictions** via Azure AD conditional access
- **Device compliance** requirements where applicable
- **Audit logging** enabled for compliance

## 📈 Continuous Integration

### GitHub Actions Example
```yaml
name: Integration Tests
on: [push, pull_request]
jobs:
  integration:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- --testNamePattern="Integration"
        env:
          INTEGRATION_TENANT_ID: ${{ secrets.INTEGRATION_TENANT_ID }}
          INTEGRATION_CLIENT_ID: ${{ secrets.INTEGRATION_CLIENT_ID }}
          INTEGRATION_CLIENT_SECRET: ${{ secrets.INTEGRATION_CLIENT_SECRET }}
```

### Success Criteria
- **All phases pass**: 100% test success rate
- **Performance targets**: Meet response time thresholds  
- **Memory efficiency**: Stay within usage limits
- **Error coverage**: Graceful handling of failure scenarios
- **Security validation**: No credential exposure

---

**This integration test suite ensures production-ready reliability with enterprise-grade testing standards.** 🏆