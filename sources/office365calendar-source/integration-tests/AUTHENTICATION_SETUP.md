# Office 365 Calendar Connector - Authentication Setup Guide

This guide explains how to set up authentication for testing the Office 365 Calendar connector in different scenarios: single user access vs system administrator access for all calendars.

## Quick Start

### Environment Variables
```bash
export O365_TENANT_ID="your-azure-tenant-id"
export O365_CLIENT_ID="your-azure-client-id" 
export O365_CLIENT_SECRET="your-azure-client-secret"

# Optional test configuration
export O365_TEST_TIMEOUT="30000"        # Test timeout in ms
export O365_TEST_CALENDAR_ID="cal-id"   # Specific calendar to test
export O365_TEST_MAX_EVENTS="100"       # Max events per request
export O365_TEST_CUTOFF_DAYS="30"       # Days of history to sync
```

### Run Tests
```bash
# Run specific phases
npm run test:real-world:auth      # Phase 1: Authentication
npm run test:real-world:phase2    # Phase 2: Calendar Discovery  
npm run test:real-world:phase3    # Phase 3: Event Fetching

# Run all real-world tests
npm run test:real-world
```

## Authentication Scenarios

### Scenario 1: Single User Calendar Access

**Use Case:** Sync calendars for a single Office 365 user (most common)

**Required Permissions (Application Type):**
- `Calendars.Read` (Microsoft Graph)
- `Calendars.Read.All` (Microsoft Graph)  
- `Directory.Read.All` (Microsoft Graph)
- `User.Read.All` (Microsoft Graph)
- `Calendars.Read` (Office 365 Exchange Online)

**CRITICAL**: All permissions must be **Application** type and granted with **Admin Consent**.

**App Registration Setup:**
1. **Go to Azure Portal** → Azure Active Directory → App registrations
2. **Create new registration:**
   - Name: `Faros Office 365 Calendar Connector - Single User`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: Not needed for client credentials flow
3. **API Permissions:**
   - Add permission → Microsoft Graph → Application permissions
   - Select: `Calendars.Read`, `User.Read`
   - **Grant admin consent** (required for application permissions)
4. **Certificates & secrets:**
   - New client secret → Copy the **Value** (not Secret ID)
5. **Get your Tenant ID:**
   - Overview tab → Directory (tenant) ID

**Configuration:**
```json
{
  "tenant_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", 
  "client_secret": "your-secret-value-here",
  "domain_wide_delegation": false
}
```

**What This Tests:**
- Authentication for a single user's calendars
- Basic calendar discovery (user's primary + additional personal calendars)
- Event fetching from accessible calendars
- Incremental sync functionality

---

### Scenario 2: System Administrator - All Users' Calendars

**Use Case:** Enterprise deployment to sync calendars across all users in tenant

**Required Permissions (Same as Scenario 1):**
- `Calendars.Read` (Microsoft Graph)
- `Calendars.Read.All` (Microsoft Graph)  
- `Directory.Read.All` (Microsoft Graph)
- `User.Read.All` (Microsoft Graph)
- `Calendars.Read` (Office 365 Exchange Online)

**App Registration Setup:**
1. **Go to Azure Portal** → Azure Active Directory → App registrations  
2. **Create new registration:**
   - Name: `Faros Office 365 Calendar Connector - Enterprise`
   - Supported account types: `Accounts in this organizational directory only`
3. **API Permissions:**
   - Add permission → Microsoft Graph → Application permissions
   - Select: `Calendars.Read`, `User.Read.All`, `Directory.Read.All`
   - **Grant admin consent** ⚠️ **Critical:** Admin must approve these elevated permissions
4. **Certificates & secrets:**
   - New client secret → Copy the **Value**

**Configuration:**
```json
{
  "tenant_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "client_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "client_secret": "your-secret-value-here", 
  "domain_wide_delegation": true,
  "calendar_ids": []  // Empty = all accessible calendars across all users
}
```

**What This Tests:**
- Authentication with elevated permissions
- User enumeration across the entire tenant
- Calendar discovery for multiple users
- Bulk event fetching and processing
- Multi-user incremental sync state management

---

## Permission Comparison

| Permission | Single User | System Admin | Purpose |
|-----------|-------------|--------------|---------|
| `Calendars.Read` | ✅ Required | ✅ Required | Read calendar and event data |
| `User.Read` | ✅ Required | ❌ Not sufficient | Read basic user profile |
| `User.Read.All` | ❌ Not needed | ✅ Required | Read all user profiles in tenant |
| `Directory.Read.All` | ❌ Not needed | ✅ Required | Enumerate users in tenant |

## Testing Best Practices

### Start with Single User
```bash
# Test with your own account first
export O365_TENANT_ID="your-tenant-id"
export O365_CLIENT_ID="single-user-app-id" 
export O365_CLIENT_SECRET="single-user-secret"

npm run test:real-world:auth
```

### Progress to System Admin  
```bash
# Only after single user tests pass
export O365_CLIENT_ID="enterprise-app-id"
export O365_CLIENT_SECRET="enterprise-secret"
export O365_DOMAIN_WIDE_DELEGATION="true"

npm run test:real-world
```

### Validate Data Quality
```bash
# Test with specific calendar for detailed validation
export O365_TEST_CALENDAR_ID="your-primary-calendar-id"
export O365_TEST_MAX_EVENTS="50"
export O365_TEST_CUTOFF_DAYS="7"

npm run test:real-world:phase3
```

## Common Issues & Troubleshooting

### "Access is denied" Errors (Most Common)
```
Error: Access is denied. Check credentials and try again.
```
**Root Cause:** Missing API permissions (most common) or Exchange Online policy issues
**Solution:** 
1. Run `.\check-api-grants.ps1` to verify and grant missing permissions
2. Wait 5-10 minutes for propagation 
3. If still failing, see `EXCHANGE_ONLINE_SETUP.md` for Exchange Online policy configuration

### Authentication Failures
```
Error: AADSTS70011: The provided value for scope is not valid
```
**Solution:** Verify permissions are granted and admin consent is provided

### Missing Client Secret
```
Error: AADSTS7000215: Invalid client secret provided
```
**Solution:** Regenerate client secret, ensure you copied the Value (not Secret ID)

### PowerShell Permission Errors
```
Error: Cannot process argument transformation on parameter 'AccessRight'
```
**Solution:** Use `RestrictAccess` not `AccessAsApp` in Exchange Online PowerShell commands

### Rate Limiting
```
Error: 429 TooManyRequests
```
**Solution:** Tests include backoff logic, but large tenants may need throttling

## Security Considerations

### Production Deployments
- **Rotate client secrets** regularly (recommended: 90 days)
- **Use Azure Key Vault** for credential storage in production
- **Monitor permission usage** through Azure AD audit logs
- **Principle of least privilege:** Use single-user permissions when possible

### Test Environment
- **Separate tenants** for development vs production testing
- **Test users** with representative calendar data
- **Clean up test data** after integration testing
- **Monitor API quotas** during load testing

## Next Steps

1. **Start with Scenario 1** (Single User) to validate basic functionality
2. **Progress to Scenario 2** (System Admin) only after single user works
3. **Run integration tests** to validate data pipeline end-to-end
4. **Performance test** with realistic data volumes for your deployment

For additional help, see:
- `REAL_WORLD_TESTING.md` - Detailed testing procedures
- `TROUBLESHOOTING.md` - Common issues and solutions
- Microsoft Graph API documentation - [Calendar API reference](https://docs.microsoft.com/en-us/graph/api/resources/calendar)