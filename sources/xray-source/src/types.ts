export interface XrayConfig {
  client_id: string;
  client_secret: string;
  timeout?: number;
}

export interface TestKey {
  readonly issueId: string;
  readonly key: string;
}

interface BaseTestDetail extends TestKey {
  readonly summary: string;
  readonly description: string;
  readonly labels: ReadonlyArray<string>;
}

export type TestPlan = BaseTestDetail;

interface TestType {
  readonly name: string;
  readonly kind: string;
}

interface Status {
  readonly name: string;
}

interface PreconditionType {
  readonly name: string;
  readonly kind: string;
}

interface Precondition {
  readonly issueId: string;
  readonly key: string;
  readonly definition: string;
  readonly rank: string;
  readonly preconditionType: PreconditionType;
}

export interface Test extends BaseTestDetail {
  readonly gherkin: string;
  readonly unstructured: string;
  readonly testType: TestType;
  readonly status: Status;
  readonly preconditions: ReadonlyArray<Precondition>;
}

export interface TestPlanTest {
  planIssueId: string;
  planKey: string;
  testIssueId: string;
  testKey: string;
}

export interface TestRun {
  id: string;
  startedOn: string;
  finishedOn: string;
  defects: ReadonlyArray<string>;
  status: Status;
  steps: ReadonlyArray<Step>;
  lastModified: string;
  test: TestKey;
  testVersion: TestVersion;
  testExecution: TestKey;
}

export interface Step {
  id: string;
  status: Status;
  defects: ReadonlyArray<string>;
}

export interface TestVersion {
  name: string;
}

export interface TestExecution extends BaseTestDetail {
  readonly testEnvironments: ReadonlyArray<string>;
}
