export interface XrayConfig {
  client_id: string;
  client_secret: string;
  timeout?: number;
}

export interface TestPlan {
  readonly issueId: string;
  readonly key: string;
  readonly summary: string;
  readonly description: string;
  readonly labels: ReadonlyArray<string>;
}

interface TestType {
  readonly name: string;
  readonly kind: string;
}

interface TestStatus {
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

export interface TestKey {
  readonly issueId: string;
  readonly key: string;
}

export interface Test extends TestKey {
  readonly summary: string;
  readonly description: string;
  readonly gherkin: string;
  readonly unstructured: string;
  readonly labels: ReadonlyArray<string>;
  readonly testType: TestType;
  readonly status: TestStatus;
  readonly preconditions: ReadonlyArray<Precondition>;
}

export interface TestPlanTest {
  planIssueId: string;
  planKey: string;
  testIssueId: string;
  testKey: string;
}
