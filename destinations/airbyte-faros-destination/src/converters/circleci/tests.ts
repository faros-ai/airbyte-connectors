import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {Dictionary} from 'ts-essentials';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {CircleCICommon, CircleCIConverter} from './common';
import {TestMetadata} from './models';

export class Tests extends CircleCIConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'qa_TestSuite',
    'qa_TestSuiteTestCaseAssociation',
    'qa_TestCase',
    'qa_TestExecution',
    'qa_TestCaseResult',
    'qa_TestExecutionCommitAssociation',
  ];

  private skipWritingTestCases: boolean | undefined = undefined;
  private readonly testCases: Set<string> = new Set<string>();
  private readonly testSuites: Set<string> = new Set<string>();
  private readonly testCaseResults: Set<string> = new Set<string>();

  private currentTestExecution?: Dictionary<any> = undefined;
  private currentTestExecutionCommit?: Dictionary<any> = undefined;

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (this.skipWritingTestCases === undefined) {
      const skipWritingTestCases =
        this.circleCIConfig(ctx)?.skip_writing_test_cases;
      this.skipWritingTestCases =
        skipWritingTestCases === undefined ? true : skipWritingTestCases;
    }

    const source = this.streamName.source;
    const test = record.record.data as TestMetadata;
    const res: DestinationRecord[] = [];

    const testSuiteUid = `${test.pipeline_id}__${test.workflow_name}__${test.classname}`;
    const testCaseUid = `${testSuiteUid}__${test.name}`;
    const testCaseResultUid = `${testCaseUid}__${test.job_id}`;
    const testExecutionUid = `${testSuiteUid}__${test.job_id}`;

    if (this.testCaseResults.has(testCaseResultUid)) {
      ctx.logger.warn(
        `Duplicate test case result will be skipped. project/${test.project_slug}/${test.job_number}/tests - ${test.classname}__${test.name} `
      );
      return res;
    }
    this.testCaseResults.add(testCaseResultUid);

    // Write test case & test suite association only once
    if (!this.skipWritingTestCases && !this.testCases.has(testCaseUid)) {
      res.push({
        model: 'qa_TestCase',
        record: {
          uid: testCaseUid,
          name: `${CircleCICommon.getProject(test.project_slug)}: ${test.name}`,
          description: test.file
            ? `${test.file}: ${test.classname}`
            : test.classname,
          source,
          type: {category: 'Custom', detail: 'unknown'},
        },
      });
      res.push({
        model: 'qa_TestSuiteTestCaseAssociation',
        record: {
          testSuite: {uid: testSuiteUid, source},
          testCase: {uid: testCaseUid, source},
        },
      });
      this.testCases.add(testCaseUid);
    }
    // Write the test suite only once
    if (!this.testSuites.has(testSuiteUid)) {
      res.push({
        model: 'qa_TestSuite',
        record: {
          uid: testSuiteUid,
          name: test.workflow_name,
          source,
          type: {category: 'Custom', detail: 'unknown'},
        },
      });
      this.testSuites.add(testSuiteUid);
    }
    // Write the test case result on every test outcome
    const testCaseResultStatus = this.convertTestStatus(test.result);
    if (!this.skipWritingTestCases) {
      res.push({
        model: 'qa_TestCaseResult',
        record: {
          uid: testCaseResultUid,
          description: test.message?.substring(0, 256),
          status: testCaseResultStatus,
          testCase: {uid: testCaseUid, source},
          testExecution: {uid: testExecutionUid, source},
        },
      });
    }

    // Aggragate info about a single test execution until a new one is detected
    // then write the aggragated info and start fresh with new test execution
    // Note: Assumes records are processed in order
    if (this.currentTestExecution?.uid !== testExecutionUid) {
      if (this.currentTestExecution && this.currentTestExecutionCommit) {
        res.push({
          model: 'qa_TestExecution',
          record: this.currentTestExecution,
        });
        res.push({
          model: 'qa_TestExecutionCommitAssociation',
          record: this.currentTestExecutionCommit,
        });
      }

      this.currentTestExecution = {
        uid: testExecutionUid,
        name: `${test.workflow_name} - ${test.job_number}`,
        source,
        status: {category: 'Success', detail: null},
        startedAt: Utils.toDate(test.job_started_at),
        endedAt: Utils.toDate(test.job_stopped_at),
        testCaseResultsStats: {
          failure: 0,
          success: 0,
          skipped: 0,
          unknown: 0,
          custom: 0,
          total: 0,
        },
        suite: {uid: testSuiteUid, source},
        build: CircleCICommon.getBuildKey(
          test.workflow_id,
          test.pipeline_id,
          test.project_slug,
          source
        ),
      };
      this.currentTestExecutionCommit = {
        testExecution: {uid: testExecutionUid, source},
        commit: CircleCICommon.getCommitKey(
          test.pipeline_vcs,
          test.project_slug
        ),
      };
      // Reset test case results set
      this.testCaseResults.clear();
    } else {
      if (testCaseResultStatus.category === 'Failure') {
        this.currentTestExecution.status = {category: 'Failure', detail: null};
        this.currentTestExecution.testCaseResultsStats.failure += 1;
      } else if (testCaseResultStatus.category === 'Success') {
        this.currentTestExecution.testCaseResultsStats.success += 1;
      } else if (testCaseResultStatus.category === 'Skipped') {
        this.currentTestExecution.testCaseResultsStats.skipped += 1;
      } else if (testCaseResultStatus.category === 'Custom') {
        this.currentTestExecution.testCaseResultsStats.custom += 1;
      } else {
        this.currentTestExecution.testCaseResultsStats.unknown += 1;
      }
      this.currentTestExecution.testCaseResultsStats.total += 1;
    }

    return res;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger.info('tests - onProcessingComplete');
    ctx.logger.info('writing final test execution and commit association');
    const res: DestinationRecord[] = [];
    res.push({
      model: 'qa_TestExecution',
      record: this.currentTestExecution,
    });
    res.push({
      model: 'qa_TestExecutionCommitAssociation',
      record: this.currentTestExecutionCommit,
    });
    return res;
  }

  convertTestStatus(testResult: string): {category: string; detail: string} {
    if (!testResult) {
      return {category: 'Unknown', detail: 'undefined'};
    }
    const detail = testResult;
    switch (testResult.toLowerCase()) {
      case 'success':
      case 'succeed':
      case 'succeeded':
      case 'pass':
      case 'passed':
        return {category: 'Success', detail};
      case 'skip':
      case 'skipped':
      case 'disable':
      case 'disabled':
      case 'ignore':
      case 'ignored':
        return {category: 'Skipped', detail};
      case 'fail':
      case 'failed':
      case 'failure':
      case 'error':
      case 'errored':
        return {category: 'Failure', detail};
      default:
        return {category: 'Custom', detail};
    }
  }
}
