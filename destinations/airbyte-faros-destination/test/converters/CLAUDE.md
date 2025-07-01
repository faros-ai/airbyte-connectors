## Guide: Adding Tests for Faros Converters

### Overview

When implementing a new faros converter, test coverage is essential. The approach differs depending on whether you're adding to an existing source or creating
the first tests for a new source.

### Adding Tests to Existing Source

#### 1. Add Test Data Record

Add your test record to the existing test data file:

- **File**: `destinations/airbyte-faros-destination/test/resources/faros_[source]/all-streams.json`
- **Format**: Standard Airbyte record structure with your stream's data

Example:

```json
{
  "record": {
    "stream": "mytestsource__gitlab__faros_releases",
    "emitted_at": 1735689600000,
    "data": {
      "__brand": "FarosRelease",
      "tag_name": "v2.1.0",
      "name": "Release 2.1.0",
      "description": "Minor release with bug fixes",
      "created_at": "2024-01-15T10:30:45.123Z",
      "released_at": "2024-01-15T14:22:30.456Z",
      "_links": {
        "self": "https://gitlab.example.com/org/repo/-/releases/v2.1.0"
      },
      "author_username": "john-doe",
      "group_id": "42",
      "project_path": "backend-services"
    }
  },
  "type": "RECORD"
}

2. Register the Stream

Add your stream to the catalog configuration:
- File: destinations/airbyte-faros-destination/test/resources/faros_[source]/catalog.json
- Add: Stream entry with destination sync mode

Example:
{
  "stream": {
    "name": "mytestsource__gitlab__faros_releases"
  },
  "destination_sync_mode": "overwrite"
}

3. Run Tests Without Snapshot Update

First, run the test to verify your converter produces the expected models:
npm test -- faros_gitlab.test.ts

Review the diff to ensure:
- Correct number of records are processed
- Expected destination models appear (e.g., cicd_Release, cicd_ReleaseTagAssociation)
- Data transformations are correct

4. Update Snapshot

If the output looks correct, update the snapshot:
npm test -- faros_gitlab.test.ts -u

This updates __snapshots__/faros_gitlab.test.ts.snap with your new models.

Creating Tests for a New Source

If you're writing the first faros tests for a new source:

1. Create Test File

Create a new test file following the pattern:
- File: destinations/airbyte-faros-destination/test/converters/faros_[source].test.ts

Use this template:
import {getLocal} from 'mockttp';
import {destinationWriteTest} from 'faros-airbyte-testing-tools';
import {tempConfig} from '../testing-tools';
import {initMockttp} from '../utils';

describe('faros_[source]', () => {
  const mockttp = getLocal({debug: false, recordTraffic: false});
  let configPath: string;

  beforeEach(async () => {
    await initMockttp(mockttp);
    configPath = await tempConfig({
      api_url: mockttp.url,
      log_records: true,
    });
  });

  afterEach(async () => {
    await mockttp.stop();
    jest.restoreAllMocks();
  });

  test('process records from all streams', async () => {
    await destinationWriteTest({
      configPath,
      catalogPath: 'test/resources/faros_[source]/catalog.json',
      inputRecordsPath: 'faros_[source]/all-streams.json',
      checkRecordsData: (records) => expect(records).toMatchSnapshot(),
    });
  });
});

2. Create Test Resources Directory

Create the directory structure:
test/resources/faros_[source]/
├── all-streams.json
└── catalog.json

3. Create Catalog File

Create catalog.json with your faros streams:
{
  "streams": [
    {
      "stream": {
        "name": "mytestsource__[source]__faros_[stream1]"
      },
      "destination_sync_mode": "overwrite"
    },
    {
      "stream": {
        "name": "mytestsource__[source]__faros_[stream2]"
      },
      "destination_sync_mode": "overwrite"
    }
  ]
}

4. Create Test Data File

Create all-streams.json with test records for each stream.

Key Points

- No separate test file needed for existing sources - Tests are integrated into existing test suites
- Create new test infrastructure for new sources following the established pattern
- Use realistic test data - Base it on actual API responses but modify values
- Verify transformations - Check that fields are mapped correctly
- Follow existing patterns - Match the structure of other test records in the file

This approach ensures comprehensive test coverage while maintaining consistency with the existing test infrastructure.
```
