import {Auth,google} from 'googleapis';

interface TokenGeneratorConfig {
  readonly client_email: string;
  readonly private_key: string;
  readonly delegated_user?: string;
  readonly domain_wide_delegation?: boolean;
}

interface AccessTokenResponse {
  token?: string | null;
  expiry_date?: number | null;
}

async function generateAuthToken(
  config: TokenGeneratorConfig
): Promise<string> {
  try {
    console.log('🔐 Generating OAuth token...');

    if (typeof config.private_key !== 'string' || !config.private_key.trim()) {
      throw new Error('private_key: must be a non-empty string');
    }
    if (
      typeof config.client_email !== 'string' ||
      !config.client_email.trim()
    ) {
      throw new Error('client_email: must be a non-empty string');
    }

    const clientOptions =
      config.domain_wide_delegation === true && config.delegated_user
        ? {subject: config.delegated_user}
        : {};

    console.log(`📧 Service Account: ${config.client_email}`);
    if (config.delegated_user) {
      console.log(`👤 Delegated User: ${config.delegated_user}`);
    }
    console.log(
      `🔑 Domain-wide Delegation: ${config.domain_wide_delegation ? 'Enabled' : 'Disabled'}`
    );

    const auth = new google.auth.GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/drive.activity.readonly',
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
        'https://www.googleapis.com/auth/admin.directory.customer.readonly',
        'https://www.googleapis.com/auth/admin.reports.audit.readonly',
        'https://www.googleapis.com/auth/directory.readonly',
      ],
      credentials: {
        private_key: config.private_key.replace(/\\n/g, '\n'),
        client_email: config.client_email,
      },
      clientOptions,
    });

    console.log('🔄 Requesting access token...');

    const authClient = await auth.getClient();

    // Type assertion to handle the auth client properly
    const oAuth2Client = authClient as Auth.OAuth2Client;
    const accessTokenResponse: AccessTokenResponse =
      await oAuth2Client.getAccessToken();

    if (!accessTokenResponse.token) {
      throw new Error('Failed to obtain access token - no token in response');
    }

    console.log('✅ Token generated successfully!');

    // Safely handle expiry date
    const expiryDate = accessTokenResponse.expiry_date;
    if (expiryDate && typeof expiryDate === 'number') {
      console.log(`🕐 Expires at: ${new Date(expiryDate).toISOString()}`);
    } else {
      console.log('🕐 Expires at: Unknown');
    }

    return accessTokenResponse.token;
  } catch (error: any) {
    console.error('❌ Error generating token:', error.message);
    throw error;
  }
}

function validateConfig(config: TokenGeneratorConfig): void {
  const missingFields: string[] = [];

  if (
    !config.client_email ||
    config.client_email ===
      'your-service-account@project.iam.gserviceaccount.com'
  ) {
    missingFields.push('GOOGLE_CLIENT_EMAIL');
  }

  if (!config.private_key || config.private_key === 'your-private-key-here') {
    missingFields.push('GOOGLE_PRIVATE_KEY');
  }

  if (missingFields.length > 0) {
    console.error('❌ Missing required configuration:');
    missingFields.forEach((field) => console.error(`   - ${field}`));
    console.error(
      '\n💡 Please set these environment variables or update the config object'
    );
    throw new Error(
      `Missing required configuration: ${missingFields.join(', ')}`
    );
  }
}

async function main() {
  console.log('🚀 Google Drive Activity Auth Token Generator\n');

  // Load environment variables if available
  try {
    require('dotenv').config();
  } catch {
    // dotenv not available, continue without it
  }

  const config: TokenGeneratorConfig = {
    client_email:
      process.env.GOOGLE_CLIENT_EMAIL ||
      'your-service-account@project.iam.gserviceaccount.com',
    private_key: process.env.GOOGLE_PRIVATE_KEY || 'your-private-key-here',
    delegated_user: process.env.GOOGLE_DELEGATED_USER,
    domain_wide_delegation:
      process.env.GOOGLE_DOMAIN_WIDE_DELEGATION === 'true',
  };

  try {
    validateConfig(config);
    const token = await generateAuthToken(config);

    console.log('\n' + '='.repeat(50));
    console.log('🎯 ACCESS TOKEN');
    console.log('='.repeat(50));
    console.log(token);

    console.log('\n' + '='.repeat(50));
    console.log('📮 FOR POSTMAN');
    console.log('='.repeat(50));
    console.log(`Authorization: Bearer ${token}`);

    console.log('\n' + '='.repeat(50));
    console.log('🔧 FOR CURL');
    console.log('='.repeat(50));
    console.log(`curl -H "Authorization: Bearer ${token}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -X POST \\`);
    console.log(
      `     -d '{"ancestorName": "items/root", "filter": "time >= \\"2024-01-01T00:00:00.000Z\\""}' \\`
    );
    console.log(`     https://driveactivity.googleapis.com/v2/activity:query`);

    console.log(
      '\n✨ Token generated successfully! Copy the token above to use in Postman.'
    );
  } catch (error) {
    console.error('\n💥 Failed to generate token');
    process.exit(1);
  }
}

// Export for use as a module
export {generateAuthToken, TokenGeneratorConfig};

// Run if this file is executed directly
if (require.main === module || process.argv[1]?.endsWith(__filename)) {
  main().catch(console.error);
}
