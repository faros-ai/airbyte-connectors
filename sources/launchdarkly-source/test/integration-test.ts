import {AirbyteSourceLogger, SyncMode} from 'faros-airbyte-cdk';

import {LaunchDarklySource} from '../src/index';
import {LaunchDarklyDataLoader} from './data-loader';

async function runIntegrationTest(): Promise<void> {
  const token = process.env.LAUNCHDARKLY_SOURCE_TEST_CONFIG;
  if (!token) {
    throw new Error(
      'LAUNCHDARKLY_SOURCE_TEST_CONFIG environment variable is required'
    );
  }

  const loader = new LaunchDarklyDataLoader(token);
  const logger = new AirbyteSourceLogger();
  const source = new LaunchDarklySource(logger);

  try {
    await loader.loadTestData();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const config = {token};

    console.log('Testing connection...');
    const [connectionSuccess, connectionMessage] =
      await source.checkConnection(config);
    if (!connectionSuccess) {
      throw new Error(`Connection test failed: ${connectionMessage}`);
    }
    console.log('✓ Connection test passed');

    const streams = await source.streams(config);
    console.log(`Found ${streams.length} streams`);

    for (const stream of streams) {
      console.log(`Testing stream: ${stream.name}`);
      let recordCount = 0;

      try {
        for await (const record of stream.readRecords(SyncMode.FULL_REFRESH)) {
          recordCount++;
          if (recordCount <= 2) {
            console.log(
              `  Record ${recordCount}:`,
              JSON.stringify(record, null, 2)
            );
          }
        }

        console.log(`✓ Stream ${stream.name} returned ${recordCount} records`);
      } catch (error) {
        if (stream.name === 'users' && error instanceof Error && error.message?.includes('404')) {
          console.log(`⚠ Stream ${stream.name} failed with 404 (users API may be deprecated)`);
        } else {
          throw error;
        }
      }
    }

    console.log('✓ Integration test completed successfully');
  } catch (error) {
    console.error('Integration test failed:', error);
    throw error;
  } finally {
    await loader.cleanup();
  }
}

if (require.main === module) {
  runIntegrationTest().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

export {runIntegrationTest};
