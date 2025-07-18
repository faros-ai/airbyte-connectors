# Real-World Testing Guide
## Office 365 Calendar Connector - Live Environment Testing

This guide walks you through setting up and running real-world tests against actual Office 365 environments using real authentication credentials.

## 🎯 Overview

The real-world testing framework validates the Office 365 Calendar connector against live Microsoft Graph API endpoints using your actual Office 365 tenant. This ensures the connector works correctly with real data and authentication flows.

## 📋 Prerequisites

### 1. Office 365 Environment
- Active Office 365 tenant
- User account with calendar access
- At least one calendar with some events (recommended for thorough testing)

### 2. Azure AD Application Registration
You need to register an application in Azure AD to obtain the required credentials.

#### Step-by-Step Azure AD Setup:

1. **Navigate to Azure Portal**
   - Go to [Azure Portal](https://portal.azure.com)
   - Sign in with your Office 365 admin account

2. **Register a New Application**
   - Go to **Azure Active Directory** → **App registrations**
   - Click **"New registration"**
   - Fill in the details:
     - **Name**: `Office365Calendar-Connector-Test`
     - **Supported account types**: Accounts in this organizational directory only
     - **Redirect URI**: Leave blank (not needed for client credentials flow)
   - Click **"Register"**

3. **Note the Application Details**
   - Copy the **Application (client) ID** - you'll need this as `O365_CLIENT_ID`
   - Copy the **Directory (tenant) ID** - you'll need this as `O365_TENANT_ID`

4. **Create a Client Secret**
   - Go to **Certificates & secrets** → **Client secrets**
   - Click **"New client secret"**
   - Add description: `Connector Testing Secret`
   - Set expiration: 6 months (or as per your security policy)
   - Click **"Add"**
   - **Copy the secret value immediately** - you'll need this as `O365_CLIENT_SECRET`
   - ⚠️ **Warning**: The secret value is only shown once!

5. **Configure API Permissions**
   - Go to **API permissions**
   - Click **"Add a permission"**
   - Select **Microsoft Graph** → **Application permissions**
   - Add the following permissions:
     - `Calendars.Read` - Read calendars in all mailboxes
     - `User.Read.All` - Read all users' basic profiles
   - Click **"Add permissions"**
   - **Important**: Click **"Grant admin consent"** for your organization

6. **Verify Permissions**
   - Ensure all permissions show "Granted for [Your Organization]"
   - Status should be green checkmarks

## 🔧 Environment Setup

### 1. Set Environment Variables

Create a `.env` file or set environment variables with your Azure AD application credentials:

```bash
# Required - Azure AD Application Details
export O365_TENANT_ID="12345678-1234-1234-1234-123456789012"
export O365_CLIENT_ID="87654321-4321-4321-4321-210987654321"
export O365_CLIENT_SECRET="your-very-long-secret-key-here"

# Optional - Test Configuration
export O365_TEST_TIMEOUT="60000"          # Test timeout in milliseconds (60 seconds)
export O365_TEST_CUTOFF_DAYS="30"         # Days of event history to fetch
export O365_TEST_MAX_EVENTS="100"         # Maximum events per request
export O365_TEST_CALENDAR_ID="cal-123"    # Specific calendar ID to test (optional)
```

### 2. Alternative: Inline Environment Variables

You can also set variables inline when running tests:

```bash
O365_TENANT_ID="your-tenant-id" \
O365_CLIENT_ID="your-client-id" \
O365_CLIENT_SECRET="your-client-secret" \
npm run test:real-world:phase1
```

## 🚀 Running the Tests

### Quick Authentication Check

Start with the quick authentication test to verify your setup:

```bash
npm run test:auth:quick
```

This runs a simple script that:
- Validates your credentials
- Attempts to authenticate with Microsoft Graph
- Reports success or failure with helpful error messages

### Phase-by-Phase Testing

Run tests incrementally to validate each component:

#### Phase 1: Authentication & Connection
```bash
npm run test:real-world:phase1
```

**What it tests:**
- OAuth2 token acquisition
- Connection health checks
- Authentication performance
- Token caching efficiency

**Expected results:**
- Authentication completes in < 10 seconds
- Connection test returns `true`
- Memory usage stays under 50MB

#### Phase 2: Calendar Discovery
```bash
npm run test:real-world:phase2
```

**What it tests:**
- Calendar enumeration
- Permission handling
- Calendar metadata validation
- Performance metrics

**Expected results:**
- At least 1 calendar discovered
- All calendars have valid structure
- Discovery completes in < 30 seconds

#### Phase 3: Event Fetching
```bash
npm run test:real-world:phase3
```

**What it tests:**
- Event retrieval with date filtering
- Pagination handling
- Event structure validation
- Performance with real data

**Expected results:**
- Events fetched successfully (if available)
- Date range filtering works correctly
- Pagination handles large datasets

### Complete Test Suite

Run all phases together:

```bash
npm run test:real-world
```

This executes all three phases sequentially and provides a comprehensive validation of the connector.

## 📊 Understanding Test Results

### Successful Output Example

```
✅ AUTHENTICATION SUCCESSFUL! ✅
⏱️  Total time: 1247ms
📅 Discovered 3 calendar(s)
📊 Event fetching summary:
   - Total events across all calendars: 42
   - Events per calendar: {"cal-1": 15, "cal-2": 27, "cal-3": 0}
📋 Ready for production use!
```

### Common Success Indicators

- **Green checkmarks (✅)** for completed tests
- **Performance metrics** within expected ranges
- **Calendar and event counts** matching your Office 365 data
- **No error messages** in the output

## 🛠️ Troubleshooting

### Authentication Issues

#### Error: "AADSTS700016: Application not found"
- **Cause**: Client ID is incorrect or app was deleted
- **Solution**: Verify the Client ID in Azure Portal

#### Error: "AADSTS7000215: Invalid client secret"
- **Cause**: Client secret is expired or incorrect
- **Solution**: Generate a new client secret in Azure Portal

#### Error: "AADSTS65001: The user or administrator has not consented"
- **Cause**: API permissions not granted
- **Solution**: Grant admin consent in Azure Portal → API permissions

### Permission Issues

#### Error: "Forbidden" or "Access Denied"
- **Cause**: Insufficient permissions or consent not granted
- **Solution**: 
  1. Verify permissions: `Calendars.Read`, `User.Read.All`
  2. Ensure admin consent is granted
  3. Check user has calendar access

### Network/Connectivity Issues

#### Error: "ECONNREFUSED" or timeout errors
- **Cause**: Network connectivity or firewall issues
- **Solution**:
  1. Check internet connection
  2. Verify firewall allows HTTPS to `graph.microsoft.com`
  3. Try increasing timeout with `O365_TEST_TIMEOUT=120000`

### Data Issues

#### Warning: "No calendars found"
- **Cause**: User account has no calendars
- **Solution**: Ensure test user has at least one calendar in Office 365

#### Warning: "No events found"
- **Cause**: Calendars are empty or outside date range
- **Solution**: 
  1. Add some events to test calendars
  2. Adjust `O365_TEST_CUTOFF_DAYS` to include older events

## 🔒 Security Best Practices

### Credential Management

1. **Never commit credentials to version control**
   ```bash
   # Add to .gitignore
   .env
   *.env
   ```

2. **Use environment variables for CI/CD**
   - Store secrets in your CI system's secret management
   - Use different credentials for different environments

3. **Rotate secrets regularly**
   - Set client secret expiration to 6 months or less
   - Create calendar reminders to rotate before expiration

4. **Limit permissions to minimum required**
   - Only grant `Calendars.Read` and `User.Read.All`
   - Avoid broader permissions like `Directory.Read.All`

### Test Environment Isolation

1. **Use dedicated test tenant** (recommended)
   - Separate from production Office 365
   - Allows safe testing without affecting real users

2. **Create test-specific calendars**
   - Use calendars specifically for testing
   - Add events with known data for validation

3. **Monitor usage**
   - Keep track of API calls during testing
   - Be aware of Microsoft Graph throttling limits

## 📈 Performance Expectations

### Baseline Performance Metrics

| Phase | Expected Duration | Memory Usage | API Calls |
|-------|------------------|--------------|-----------|
| Phase 1: Auth | < 10 seconds | < 50MB | 2-3 calls |
| Phase 2: Calendars | < 30 seconds | < 100MB | 1-5 calls |
| Phase 3: Events | < 60 seconds | < 200MB | 5-20 calls |

### Factors Affecting Performance

- **Network latency** to Microsoft Graph endpoints
- **Number of calendars** in the tenant
- **Number of events** within the date range
- **Event complexity** (attendees, recurrence, etc.)

## 🔄 Continuous Integration Setup

### GitHub Actions Example

```yaml
name: Real-World Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  real-world-tests:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run real-world tests
      env:
        O365_TENANT_ID: ${{ secrets.O365_TENANT_ID }}
        O365_CLIENT_ID: ${{ secrets.O365_CLIENT_ID }}
        O365_CLIENT_SECRET: ${{ secrets.O365_CLIENT_SECRET }}
      run: npm run test:real-world
```

### Setting Up CI Secrets

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `O365_TENANT_ID`
   - `O365_CLIENT_ID`
   - `O365_CLIENT_SECRET`

## 📚 Next Steps

After successful real-world testing:

1. **Document any configuration optimizations** discovered during testing
2. **Update error handling** based on real API responses
3. **Fine-tune performance parameters** for your specific environment
4. **Create customer onboarding documentation** based on test results
5. **Prepare for production deployment** with confidence

## 🆘 Getting Help

If you encounter issues not covered in this guide:

1. **Check the console output** for detailed error messages
2. **Review Azure AD audit logs** for authentication failures
3. **Consult Microsoft Graph documentation** for API-specific issues
4. **Enable debug logging** by setting `NODE_ENV=development`

## 📝 Test Data Requirements

For comprehensive testing, ensure your test environment includes:

### Calendars
- At least 1 primary calendar
- Optional: Shared calendars
- Optional: Resource calendars (rooms, equipment)

### Events
- Recent events (within last 30 days)
- Future events
- All-day events
- Recurring events
- Events with attendees
- Events with locations
- Events with various time zones

### Edge Cases
- Empty calendars
- Very long event titles/descriptions
- International characters in event data
- Events with many attendees (10+)

This comprehensive test data ensures thorough validation of the connector's capabilities.