import {AirbyteRecord} from 'faros-airbyte-cdk';
import {Utils} from 'faros-js-client';
import {toString} from 'lodash';

import {DestinationRecord, StreamContext} from '../converter';
import {ZephyrConverter} from './common';

type TestCase = {
  key: string;
  name: string;
  description: string;
  tags: ReadonlyArray<string>;
  cycles: Set<string>;
};

type ReleaseVersion = {
  uid: string;
  name: string;
  source: string;
};

export class TestExecutions extends ZephyrConverter {
  private readonly collectedTestCases = new Map<string, TestCase>();
  private readonly collectedReleaseVersions = new Map<string, ReleaseVersion>();
  readonly destinationModels = [
    'tms_TaskTestCaseResultAssociation',
    'qa_TestCase',
    'qa_TestSuiteTestCaseAssociation',
    'qa_TestCaseResult',
  ];

  async convert(
    record: AirbyteRecord
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const testExecution = record.record.data;

    this.collectTestCase(
      testExecution.issueKey,
      testExecution.summary,
      testExecution.cycleId,
      testExecution.issueDescription,
      testExecution.label
    );
    const testCaseResultKey = {
      uid: toString(testExecution.id),
      source: this.source,
    };
    const testCase = {
      uid: toString(testExecution.issueKey),
      source: this.source,
    };

    const versionId = testExecution.versionId;
    // -1 means no version is used.
    // https://support.smartbear.com/zephyr-squad-server/docs/en/zephyr-squad-server-rest-api/zephyr-squad-api---how-to/get-test-execution-properties.html
    const releaseVersion =
      versionId && versionId !== -1
        ? {uid: toString(versionId), source: this.source}
        : null;
    if (releaseVersion?.uid) {
      const uid = releaseVersion.uid;
      this.collectedReleaseVersions.set(uid, {
        uid,
        name: testExecution.versionName,
        source: this.source,
      });
    }

    const results = [];
    results.push({
      model: 'qa_TestCaseResult',
      record: {
        ...testCaseResultKey,
        source: this.source,
        startedAt: Utils.toDate(testExecution.executedOnVal),
        status: TestExecutions.getStatus(testExecution.executionStatusName),
        tags: this.labelToTag(testExecution.label),
        testCase,
        releaseVersion,
      },
    });

    for (const defect of testExecution.defects ?? []) {
      results.push({
        model: 'tms_TaskTestCaseResultAssociation',
        record: {
          defect: {uid: defect.key, source: this.taskSource},
          testCaseResult: testCaseResultKey,
        },
      });
    }

    return results;
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    return [...this.convertTestCases(), ...this.convertReleaseVersions()];
  }

  private static getStatus(status: string): {category: string; detail: string} {
    const detail = status.toUpperCase();
    switch (detail) {
      case 'PASS':
        return {category: 'Success', detail};
      case 'FAIL':
        return {category: 'Failure', detail};
      case 'NA':
        return {category: 'Unknown', detail};
      default:
        return {category: 'Custom', detail};
    }
  }

  private collectTestCase(
    key: string,
    name: string,
    cycleId: string,
    description?: string,
    label?: string
  ): string | null {
    if (!key) {
      return null;
    }
    const tags = this.labelToTag(label);

    if (!this.collectedTestCases.has(key)) {
      this.collectedTestCases.set(key, {
        key,
        name,
        description,
        tags,
        cycles: new Set([cycleId]),
      });
    } else {
      this.collectedTestCases.get(key)?.cycles.add(cycleId);
    }

    return key;
  }

  private convertTestCases(): DestinationRecord[] {
    const results = [];
    for (const testCase of this.collectedTestCases.values()) {
      results.push({
        model: 'qa_TestCase',
        record: {
          uid: testCase.key,
          name: testCase.name,
          description: Utils.cleanAndTruncate(testCase.description),
          source: this.source,
          task: {uid: testCase.key, source: this.taskSource},
        },
      });

      for (const cycleId of testCase.cycles) {
        results.push({
          model: 'qa_TestSuiteTestCaseAssociation',
          record: {
            testSuite: {uid: toString(cycleId), source: this.source},
            testCase: {uid: testCase.key, source: this.source},
          },
        });
      }
    }

    return results;
  }

  private convertReleaseVersions(): DestinationRecord[] {
    return Array.from(this.collectedReleaseVersions.values()).map(
      (releaseVersion) => ({
        model: 'qa_ReleaseVersion',
        record: releaseVersion,
      })
    );
  }
}
