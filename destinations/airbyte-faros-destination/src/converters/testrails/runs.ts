import {AirbyteRecord} from 'faros-airbyte-cdk';
import {DateTime} from 'luxon';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {TestRailsConverter} from './common';

export class Runs extends TestRailsConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestExecution',
  ];

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const res: DestinationRecord[] = [];
    const source = this.streamName.source;
    const run = record.record.data;

    const testCaseResultsStats = {
      success: run.passed_count ?? 0,
      failure: run.failed_count ?? 0,
      skipped: run.untested_count ?? 0,
      custom: (run.retest_count ?? 0) + (run.blocked_count ?? 0),
      total: 0,
    };
    testCaseResultsStats.total =
      testCaseResultsStats.success +
      testCaseResultsStats.failure +
      testCaseResultsStats.skipped +
      testCaseResultsStats.custom;

    const milestoneTag = `milestone:${run.milestone}`;

    res.push({
      model: 'qa_TestExecution',
      record: {
        uid: this.runUid(run.project_id, run.suite_id, run.id),
        name: run.name,
        description: run.description,
        source,
        startedAt: run.created_on
          ? DateTime.fromSeconds(run.created_on).toJSDate()
          : undefined,
        endedAt: run.completed_on
          ? DateTime.fromSeconds(run.completed_on).toJSDate()
          : undefined,
        testCaseResultsStats,
        suite: {
          uid: this.suiteUid(run.project_id, run.suite_id),
          source,
        },
        tags: [milestoneTag],
      },
    });

    return res;
  }
}
