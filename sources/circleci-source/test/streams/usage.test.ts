import {
  AirbyteLogLevel,
  AirbyteSourceLogger,
  SyncMode,
} from 'faros-airbyte-cdk';
import {Dictionary} from 'ts-essentials';

import {CircleCI, CircleCIConfig} from '../../src/circleci/circleci';
import {Usage} from '../../src/streams/usage';

describe('Usage stream', () => {
  const logger = new AirbyteSourceLogger(
    process.env.LOG_LEVEL === 'debug'
      ? AirbyteLogLevel.DEBUG
      : AirbyteLogLevel.FATAL
  );

  const config: CircleCIConfig = {
    token: 'test-token',
    project_slugs: ['gh/test/project'],
    cutoff_days: 30,
    usage_export_min_gap_hours: 24,
    reject_unauthorized: true,
  };

  const orgSlice = {
    orgId: 'org1',
    orgSlug: 'test-org',
  };

  let mockCircleCI: any;
  let usageStream: Usage;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCircleCI = {
      getAllOrganizations: jest
        .fn()
        .mockResolvedValue([{id: 'org1', slug: 'test-org'}]),
      createUsageExport: jest.fn(),
      getUsageExport: jest.fn(),
    };

    CircleCI.instance = jest.fn().mockReturnValue(mockCircleCI);
    usageStream = new Usage(config, logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('first sync - creates initial export job', async () => {
    const mockJob = {
      usage_export_job_id: 'job-123',
      state: 'created',
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-31T00:00:00Z',
    };

    mockCircleCI.createUsageExport.mockResolvedValue(mockJob);

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      {} // No existing state
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    expect(mockCircleCI.createUsageExport).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockJob,
    });

    // Verify state is updated correctly
    const finalState = usageStream.getUpdatedState({}, records[0]);
    expect(finalState).toEqual({
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T00:00:00Z',
        job_id: 'job-123',
        state: 'created',
      },
    });
  });

  test('second sync - checks existing job status (still processing)', async () => {
    const existingState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T00:00:00Z',
        job_id: 'job-123',
        state: 'created',
      },
    };

    const mockJobStatus = {
      usage_export_job_id: 'job-123',
      state: 'processing',
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-31T00:00:00Z',
    };

    mockCircleCI.getUsageExport.mockResolvedValue(mockJobStatus);

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      existingState
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    expect(mockCircleCI.getUsageExport).toHaveBeenCalledWith('org1', 'job-123');
    expect(mockCircleCI.createUsageExport).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockJobStatus,
    });

    // Verify state is updated correctly
    const finalState = usageStream.getUpdatedState(existingState, records[0]);
    expect(finalState).toEqual({
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T00:00:00Z',
        job_id: 'job-123',
        state: 'processing',
      },
    });
  });

  test('third sync - job completed, creates incremental export', async () => {
    const pastTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    const existingState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: pastTime,
        job_id: 'job-123',
        state: 'completed',
      },
    };

    const mockIncrementalJob = {
      usage_export_job_id: 'job-456',
      state: 'created',
      start: pastTime,
      end: new Date().toISOString(),
    };

    mockCircleCI.createUsageExport.mockResolvedValue(mockIncrementalJob);

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      existingState
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    expect(mockCircleCI.createUsageExport).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockIncrementalJob,
    });
  });

  test('sync with completed job - respects min gap hours', async () => {
    const recentTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
    const existingState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: recentTime,
        job_id: 'job-123',
        state: 'completed',
      },
    };

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      existingState
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    // Should skip creating new export due to min gap hours
    expect(mockCircleCI.createUsageExport).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  test('sync with failed job - creates retry with extended window', async () => {
    const existingState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-15T00:00:00Z', // 14-day window
        job_id: 'job-123',
        state: 'failed',
        error_reason: 'Export timeout',
      },
    };

    const mockRetryJob = {
      usage_export_job_id: 'job-retry-789',
      state: 'created',
      start: '2024-01-01T00:00:00Z',
      end: '2024-02-01T00:00:00Z', // Extended to 32 days
    };

    mockCircleCI.createUsageExport.mockResolvedValue(mockRetryJob);

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      existingState
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    expect(mockCircleCI.createUsageExport).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockRetryJob,
    });
  });

  test('sync with processing job that becomes completed', async () => {
    const pastTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    const existingState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: pastTime,
        job_id: 'job-123',
        state: 'processing',
      },
    };

    const mockCompletedJob = {
      usage_export_job_id: 'job-123',
      state: 'completed',
      start: '2024-01-01T00:00:00Z',
      end: pastTime,
      download_urls: ['https://example.com/export.csv.gz'],
    };

    const mockIncrementalJob = {
      usage_export_job_id: 'job-incremental-456',
      state: 'created',
      start: pastTime,
      end: new Date().toISOString(),
    };

    mockCircleCI.getUsageExport.mockResolvedValue(mockCompletedJob);
    mockCircleCI.createUsageExport.mockResolvedValue(mockIncrementalJob);

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      existingState
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    expect(mockCircleCI.getUsageExport).toHaveBeenCalledWith('org1', 'job-123');
    expect(mockCircleCI.createUsageExport).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(2); // Both the completed job status and the incremental export
    expect(records[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockCompletedJob,
    });
    expect(records[1]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockIncrementalJob,
    });
  });

  test('sync with processing job that becomes failed', async () => {
    const existingState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T00:00:00Z',
        job_id: 'job-123',
        state: 'processing',
      },
    };

    const mockFailedJob = {
      usage_export_job_id: 'job-123',
      state: 'failed',
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-31T00:00:00Z',
      error_reason: 'Export failed due to system error',
    };

    const mockRetryJob = {
      usage_export_job_id: 'job-retry-456',
      state: 'created',
      start: '2024-01-01T00:00:00Z',
      end: '2024-02-01T00:00:00Z',
    };

    mockCircleCI.getUsageExport.mockResolvedValue(mockFailedJob);
    mockCircleCI.createUsageExport.mockResolvedValue(mockRetryJob);

    const records = [];
    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      existingState
    );

    for await (const record of recordIter) {
      records.push(record);
    }

    expect(mockCircleCI.getUsageExport).toHaveBeenCalledWith('org1', 'job-123');
    expect(mockCircleCI.createUsageExport).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(2); // Both the failed job status and the retry job
    expect(records[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockFailedJob,
    });
    expect(records[1]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...mockRetryJob,
    });
  });

  test('state persistence across multiple records', async () => {
    const mockJob = {
      usage_export_job_id: 'job-123',
      state: 'created',
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-31T00:00:00Z',
    };

    mockCircleCI.createUsageExport.mockResolvedValue(mockJob);

    const recordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      {}
    );

    let state: Dictionary<any> = {};
    for await (const record of recordIter) {
      state = usageStream.getUpdatedState(state, record);
    }

    // Test state updates correctly
    expect(state).toEqual({
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: '2024-01-31T00:00:00Z',
        job_id: 'job-123',
        state: 'created',
      },
    });

    // Test that the same state can be used in next sync
    // Use a time that's far enough in the past to avoid min gap hours check
    const pastTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    const nextMockJob = {
      usage_export_job_id: 'job-123',
      state: 'completed',
      start: '2024-01-01T00:00:00Z',
      end: pastTime,
      download_urls: ['https://example.com/export.csv.gz'],
    };

    const nextIncrementalJob = {
      usage_export_job_id: 'job-incremental-789',
      state: 'created',
      start: pastTime,
      end: new Date().toISOString(),
    };

    mockCircleCI.getUsageExport.mockResolvedValue(nextMockJob);
    mockCircleCI.createUsageExport.mockResolvedValue(nextIncrementalJob);

    // Update state to reflect completed job with past end time
    const completedState = {
      org1: {
        start: '2024-01-01T00:00:00Z',
        end: pastTime,
        job_id: 'job-123',
        state: 'completed',
      },
    };

    const nextRecords = [];
    const nextRecordIter = usageStream.readRecords(
      SyncMode.FULL_REFRESH,
      undefined,
      orgSlice,
      completedState
    );

    for await (const record of nextRecordIter) {
      nextRecords.push(record);
    }

    // Should create incremental export since enough time has passed
    expect(nextRecords).toHaveLength(1);
    expect(nextRecords[0]).toEqual({
      org_id: 'org1',
      org_slug: 'test-org',
      ...nextIncrementalJob,
    });
  });
});
