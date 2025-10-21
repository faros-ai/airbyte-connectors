# Bucketing and Round-Robin Execution Spec v1.0

Status: Draft

This spec standardizes how connectors in this repo partition work via deterministic bucketing and optionally advance buckets using round-robin execution. It aims to ensure consistent configuration, behavior, and state handling across all connectors that support parallelization through buckets.

## Goals
- Define a consistent configuration surface for bucketing across connectors.
- Specify a deterministic bucketing function that yields stable assignments.
- Specify how round-robin execution selects the next bucket per run and how state is stored.
- Provide validation rules, integration patterns, and test vectors.

## Motivation
Many sources contain more entities than a single sync can process efficiently or within time windows. Bucketing enables deterministic partitioning of work so that:
- Multiple workers can run in parallel by assigning distinct `bucket_id`s, reducing end-to-end sync time.
- A single worker can slice large datasets by enabling `round_robin_bucket_execution`, distributing work evenly across runs and smoothing API usage.
- Teams can roll out or restrict processing to a subset of buckets via `bucket_ranges` (e.g., canary or phased deployments).

Primary outcomes:
- Faster syncs through parallelization, or predictable sliced progress on a single worker.
- Stable, repeatable partitioning to avoid duplicate processing across workers.
- Fair rotation across buckets to balance load over time.

## Non-Goals
- General rate limiting or concurrency scheduling (handled separately per connector).
- Schema for data selection within a stream (connector-specific).

## Terminology
- Bucket: A 1-indexed partition number in `[1, bucket_total]`.
- Deterministic bucketing: Hash-based assignment of an entity to a bucket.
- Round-robin execution: Advancing the selected `bucket_id` on each run, optionally constrained to a subset of buckets.

## Configuration
All keys live in the connector config and map to TypeScript types (see `faros-airbyte-common/src/common/bucketing.ts` `RoundRobinConfig`).

- `bucket_total` (number, default: 1): Total number of buckets. Must be a positive integer.
- `bucket_id` (number, default: 1): The active bucket to process in this run. Must be in `[1, bucket_total]`.
- `round_robin_bucket_execution` (boolean, default: false): When true, the active `bucket_id` for this run is chosen by the round-robin algorithm and written to state. When false, the configured `bucket_id` is used as-is.
- `bucket_ranges` (string | string[], optional): Only meaningful when `round_robin_bucket_execution` is true. Defines a subset of buckets that are eligible for selection via round-robin. Supports forms:
  - Single number: `"7"`
  - Range: `"3-5"`
  - Comma-separated union: `"1-3,5,7-9"`
  - Array of the above forms: `["1-3", "5", "7-9"]`

## Source Spec Fields
Connectors that support bucketing MUST expose the following fields in their `resources/spec.json`. These map 1:1 with `RoundRobinConfig` and should be mirrored in the connector’s `src/types.ts`.

- `bucket_id`:
  - type: `integer`
  - title: "Bucket Number"
  - description: "Bucket number for partitioning and parallel processing. Used to distribute entities across multiple sync instances."
  - minimum: `1`
  - default: `1`

- `bucket_total`:
  - type: `integer`
  - title: "Total Number of Buckets"
  - description: "Total number of buckets to partition entities for parallel processing. bucket_id should be less than or equal to this number."
  - minimum: `1`
  - default: `1`

- `round_robin_bucket_execution`:
  - type: `boolean`
  - title: "Round Robin Bucket Execution"
  - description: "Enable round-robin execution of buckets. When enabled, the connector processes one bucket per run, automatically advancing the bucket between runs via state."
  - default: `false`

- `bucket_ranges`:
  - type: `array` of `string` (or `string` if your spec tooling prefers a single string that can be comma-separated; array is recommended)
  - title: "Bucket Ranges"
  - description: "Optional list of bucket ranges for round-robin execution (e.g., ['1-3', '5-7']). Only used when round_robin_bucket_execution is enabled."
  - examples: `["1-3", "5", "7-9"]`
  - default: omit (undefined)

Recommended ordering in `spec.json` (using the optional `order` property if supported):
1) `round_robin_bucket_execution`
2) `bucket_total`
3) `bucket_id`
4) `bucket_ranges`

Example `spec.json` excerpt:

```json
{
  "type": "object",
  "properties": {
    "round_robin_bucket_execution": {
      "type": "boolean",
      "title": "Round Robin Bucket Execution",
      "description": "Enable round-robin execution of buckets. When enabled, the connector processes one bucket per run, automatically advancing the bucket between runs via state.",
      "default": false,
      "order": 10
    },
    "bucket_total": {
      "type": "integer",
      "title": "Total Number of Buckets",
      "description": "Total number of buckets to partition entities for parallel processing. bucket_id should be less than or equal to this number.",
      "minimum": 1,
      "default": 1,
      "order": 11
    },
    "bucket_id": {
      "type": "integer",
      "title": "Bucket Number",
      "description": "Bucket number for partitioning and parallel processing. Used to distribute entities across multiple sync instances.",
      "minimum": 1,
      "default": 1,
      "order": 12
    },
    "bucket_ranges": {
      "type": "array",
      "items": {"type": "string"},
      "title": "Bucket Ranges",
      "description": "Optional list of bucket ranges for round-robin execution (e.g., ['1-3', '5-7']). Only used when round_robin_bucket_execution is enabled.",
      "order": 13
    }
  }
}
```

Schema simplicity rules (important):
- Keep JSON Schema simple. Do not add cross-field logic like `oneOf`, `allOf`, `dependentRequired`, or `$data`-based constraints to couple `bucket_id` and `bucket_total`.
- Enforce relationships (e.g., `1 ≤ bucket_id ≤ bucket_total`) in code via `validateBucketingConfig`, not in JSON Schema. Defaults already ensure presence; runtime validation ensures correctness.
- Do not introduce connector-specific names for these fields; use `bucket_id`, `bucket_total`, `round_robin_bucket_execution`, and `bucket_ranges` for consistency unless there is an established legacy contract.

Types mapping in `src/types.ts`:

```ts
import {RoundRobinConfig} from 'faros-airbyte-common/common';

export interface MySourceConfig extends AirbyteConfig, RoundRobinConfig {
  // additional connector-specific fields here
}
```

UI/Docs guidance to include in connector READMEs:
- Explain that enabling round-robin will process one bucket per run and automatically advance the bucket based on connector state.
- Clarify that `bucket_ranges` narrows which buckets participate in round-robin (e.g., for phased rollouts). When round-robin is disabled, `bucket_ranges` is ignored.
- Provide example configurations for common deployments (single worker: keep defaults; N workers: set `bucket_total = N` and run N instances with different `bucket_id`s; cron-based single worker with round-robin: enable `round_robin_bucket_execution`).

## Bucketing Entity Selection
- Developer choice: The connector author chooses the entity used for bucketing based on what yields balanced, deterministic partitions for that source.
- Guidelines (with GitHub as the example):
  - Use a stable identifier per entity: for GitHub, the canonical `"{org}/{repo}"`.
  - Build `entityKey` as a concise, canonical string and avoid volatile attributes (timestamps, mutable names).
  - Keep the connector-level `connectorKey` constant and unique: for GitHub, `"farosai/airbyte-github-source"`.
  - Apply filtering consistently at the earliest feasible selection point (e.g., when enumerating repositories) to avoid unnecessary API calls.

## State Contract
Round-robin execution persists progress in connector state under a reserved key:

```jsonc
{
  "__bucket_execution_state": {
    "last_executed_bucket_id": 4
  }
}
```

- This key is maintained by the framework helper and must be treated as an implementation detail by connectors.
- If absent, the round-robin selector behaves as if the last executed bucket was `bucket_total` (so the next bucket is `1` by default, or the first in the eligible set).

## Algorithms

### Deterministic Bucketing (Assignment)

Function: `bucket(key: string, data: string, bucketTotal: number): number`

Behavior:
- Compute `H = HMAC_MD5(key, data)`.
- Take the first 8 hex chars of `H`, parse as an unsigned 32-bit integer `X`.
- Return `(X % bucketTotal) + 1` (1-indexed).

Properties:
- Stable across runs and processes for the same `(key, data, bucketTotal)`.
- Distribution is sufficiently uniform for partitioning, but not cryptographic security.
- `key` acts as a namespace to avoid accidental cross-connector coupling. For GitHub, use `"farosai/airbyte-github-source"`.
- `data` should be a stable identifier for the entity being partitioned. For GitHub, use the canonical repo path `"{org}/{repo}"`.

### Round-Robin Selection (Active Bucket for This Run)

Functions:
- `validateBucketingConfig(config, logger?)`: Validates constraints and `bucket_ranges` format. Throws `VError` on invalid input. Logs when `bucket_ranges` is provided but `round_robin_bucket_execution` is false.
- `nextBucketId(config, state?)`: Computes the next bucket id using either all buckets or the `bucket_ranges` subset.
- `applyRoundRobinBucketing(config, state?, logger?) -> {config, state}`: If `round_robin_bucket_execution` is true, returns an updated `config` with `bucket_id = nextBucketId(...)` and an updated `state` with `__bucket_execution_state.last_executed_bucket_id` set to that value; otherwise returns inputs as-is.

Selection Behavior:
- Without `bucket_ranges`: if last was `k`, next is `((k % bucket_total) + 1)`.
- With `bucket_ranges`: build an ascending, de-duplicated set of eligible buckets from ranges; select the smallest eligible bucket strictly greater than the last executed; if none, wrap to the smallest eligible bucket.

Important: `bucket_ranges` affects only the selection of the next `bucket_id` for a run. It is not a runtime filter. During a run, slice/entity filtering MUST compare an entity’s computed `bucket(...)` strictly to the active `config.bucket_id`. Do not attempt to include a range of buckets within a single run.

Validation Rules:
- `bucket_total >= 1`.
- `1 <= bucket_id <= bucket_total`.
- If `bucket_ranges` is provided:
  - It must not be empty after trimming/splitting.
  - All numbers must be integers within `[1, bucket_total]`.
  - Ranges must be `start <= end`.
  - If `round_robin_bucket_execution` is false, `bucket_ranges` is ignored with an informational log.

## Integration Patterns

Connectors that support bucketing MUST follow this integration order:

1) At config load (e.g., `checkConnection` or early in `streams()`):
- Call `validateBucketingConfig(config, logger.info.bind(logger))`.

2) At the very start of a run (before stream creation) when round-robin is enabled:
- Call `{config: cfg, state: st} = applyRoundRobinBucketing(config, state, logger.info.bind(logger))`.
- Persist `st` as the connector state for the run, and use `cfg.bucket_id` for all subsequent logic.

3) Centralize filtering at the entity enumeration boundary:
- Compute `bucket(connectorKey, entityId, config.bucket_total) === config.bucket_id` once, in a single shared place, and reuse across streams.
- Placement guidance (normative):
  - SHOULD implement filtering inside the main client’s entity listing methods (e.g., `getRepositories`, `getProjects`, `getPipelines`) via a private `isXInBucket(...)` helper. This is the canonical pattern used by existing sources.
  - MAY implement filtering in a single shared base stream (e.g., `StreamWithProjectSlices`) only when a first-party client abstraction does not exist. All concrete streams then subclass this base.
  - MUST NOT duplicate bucketing logic across individual streams or wrapper/filter utilities around the client (to avoid drift and missed paths).
- Only process entities that match the active bucket. Do not filter by `bucket_ranges` at runtime.

Example (pseudocode):

```ts
// 1) Validate
validateBucketingConfig(config, logger.info.bind(logger));

// 2) Apply round-robin selection (if enabled)
const {config: cfg, state: st} = applyRoundRobinBucketing(config, state, logger.info.bind(logger));

// 3) Filtering per-entity (centralized in one place)
const DEFAULT_BUCKET_ID = 1;
const DEFAULT_BUCKET_TOTAL = 1;
const connectorKey = 'farosai/airbyte-github-source'; // constant
function inBucket(org: string, repo: string): boolean {
  const entityKey = `${org}/${repo}`;
  return (
    bucket(
      connectorKey,
      entityKey,
      cfg.bucket_total ?? DEFAULT_BUCKET_TOTAL
    ) === (cfg.bucket_id ?? DEFAULT_BUCKET_ID)
  );
}
```

GitHub example (centralized in client):

```ts
// onBeforeRead in the source
const {config: cfg, state} = applyRoundRobinBucketing(config, state, logger.info.bind(logger));
// Pass cfg to streams; clients are instantiated after this point

// In src/github.ts (client)
class GitHubClient {
  private static readonly DEFAULT_BUCKET_ID = 1;
  private static readonly DEFAULT_BUCKET_TOTAL = 1;
  private readonly bucketId: number;
  private readonly bucketTotal: number;
  private static readonly connectorKey = 'farosai/airbyte-github-source';

  constructor(cfg: GitHubConfig, private readonly logger: AirbyteLogger) {
    this.bucketId = cfg.bucket_id ?? GitHubClient.DEFAULT_BUCKET_ID;
    this.bucketTotal = cfg.bucket_total ?? GitHubClient.DEFAULT_BUCKET_TOTAL;
  }

  private isRepoInBucket(org: string, repo: string): boolean {
    const entityKey = `${org}/${repo}`;
    return (
      bucket(GitHubClient.connectorKey, entityKey, this.bucketTotal) ===
      this.bucketId
    );
  }

  async getRepositories(orgLogin: string): Promise<Repository[]> {
    const results: Repository[] = [];
    for await (const repo of this.listReposFromAPI(orgLogin)) {
      if (!this.isRepoInBucket(orgLogin, repo.name)) continue;
      results.push(repo);
    }
    return results;
  }

  // listReposFromAPI wraps pagination over the GitHub API
  private async *listReposFromAPI(org: string): AsyncGenerator<Repository> { /* ... */ }
}

// In streams, simply consume the already-filtered list
for (const repo of await github.getRepositories(org)) {
  // process repo; no per-stream bucket checks needed
}
```

Notes:
- Keep the `connectorKey` constant per connector to maintain stable assignment.
- Choose `entityKey` to produce even distribution and to ensure deterministic selection (avoid including rapidly changing fields).

## Singletons And Process Model
- Airbyte processes: Spec, check, discover, and read run in separate processes. Any in‑memory singleton created during check does not persist into the read process.
- Implication for bucketing: Round‑robin is applied in `onBeforeRead`; streams and clients created after this step see the updated `bucket_id`/`bucket_total`. Singletons are per‑process, so “stale buckets” from a prior command do not carry over.
- Correct usage:
  - Validate early: call `validateBucketingConfig(config, logger)` at the start of read and/or check paths.
  - Apply in read: use `applyRoundRobinBucketing(config, state, logger)` in `onBeforeRead` and pass the returned `config` to all streams.
  - Instantiate after update: construct service clients (and perform bucketing checks) only after `onBeforeRead` returns the updated `config`.
  - Filter site: perform `bucket(...) === bucket_id` checks in code that uses the updated config (e.g., stream iterators or clients created post‑`onBeforeRead`).
- Testing considerations: Tests may run multiple reads in one process; reset singletons between tests or ensure tests instantiate clients after config is updated in the test flow.
- Recommended pattern (pseudocode):
  - onBeforeRead:
    - `validateBucketingConfig(config, logger)`
    - `{config: cfg, state} = applyRoundRobinBucketing(config, state, logger)`
    - return `{config: cfg, state}`
  - Streams:
    - `const client = Service.instance(cfg, logger)` // called after cfg is updated
    - Apply `bucket(connectorKey, entityKey, cfg.bucket_total) === cfg.bucket_id` where applicable.
- Notes:
  - CircleCI streams compute `bucket(...)` directly from `cfg` and are robust to singleton concerns.
  - For sources that don’t yet filter by bucket (e.g., GitLab), ensure that when adding bucketing later, clients are initialized with the post‑`onBeforeRead` config and filters run with that config.

## Test Vectors (Deterministic Bucketing)
These vectors verify consistent results across implementations for GitHub:

```
key="farosai/airbyte-github-source", data="facebook/react", bucket_total=12 => 9
key="farosai/airbyte-github-source", data="torvalds/linux", bucket_total=12 => 9
key="farosai/airbyte-github-source", data="openai/gpt", bucket_total=7 => 3
key="farosai/airbyte-github-source", data="openai/evals", bucket_total=7 => 1
key="farosai/airbyte-github-source", data="vercel/next.js", bucket_total=12 => 7
key="farosai/airbyte-github-source", data="octo-org/hello-world", bucket_total=10 => 6
key="farosai/airbyte-github-source", data="octo-org/repo", bucket_total=10 => 4
key="farosai/airbyte-github-source", data="myco/frontend", bucket_total=10 => 8
key="farosai/airbyte-github-source", data="myco/backend", bucket_total=10 => 7
```

## Recommended Tests

Test organization:
- Prefer a single, dedicated client-level test (e.g., `bucketing.test.ts`) that verifies filtering at the entity enumeration boundary. Avoid duplicating the same bucket checks across individual streams.
- Add minimal integration/snapshot coverage only where stream wiring materially affects inputs to the client or state handling.

- Validation tests:
  - Reject `bucket_total < 1`.
  - Reject `bucket_id` outside `[1, bucket_total]`.
  - Reject empty/invalid `bucket_ranges` and out-of-bounds values.
  - Log (not throw) when `bucket_ranges` is set but `round_robin_bucket_execution` is false.
  - Defaults when fields are omitted: `bucket_id` and `bucket_total` default to 1 (1/1 behavior processes everything).

- Round-robin tests:
  - Without `bucket_ranges`, with `bucket_total = N`, sequence cycles `1..N`.
  - With `bucket_ranges = "2-3,5"` and `N=6`, sequence cycles `2,3,5,2,...` from any starting state.
  - When state is absent, first selection is `1` (or the smallest eligible bucket when ranges are defined).

- Deterministic bucketing tests:
  - Verify the test vectors above.
  - Verify that changing the `key` changes assignments (namespacing effect).
  - Verify stability across process restarts.

- Behavior/edge cases:
  - Empty-bucket scenario: when `bucket_total` exceeds available entities, the run may legitimately process zero entities; confirm no error and correct logging as per connector norms.
  - Centralization: assert that filtering occurs once at the client listing layer (or shared base stream) and is not duplicated per stream.

## Compliance Checklist (Connector-Level)

- Uses `validateBucketingConfig` during initialization.
- Uses `applyRoundRobinBucketing` to mutate `config` and `state` when `round_robin_bucket_execution` is enabled.
- Filters entities using `bucket(<connectorKey>, <entityKey>, bucket_total) === bucket_id` exactly once at the client listing layer (SHOULD) or a single shared base stream (MAY); no per‑stream duplication.
- Stores and returns updated state with `__bucket_execution_state.last_executed_bucket_id` when round-robin is enabled.
- Documents which entities are subject to bucketing and how `entityKey` is formed.

## Logging
- When round-robin is enabled, log the chosen `bucket_id`: e.g., `"Using round robin bucket execution. Bucket id: <n>"`.
- When `bucket_ranges` is provided but round-robin is disabled, log that ranges are ignored.

## Performance & Security Notes
- HMAC-MD5 is used here for deterministic distribution, not for security; no secrets should be placed in `data`. The `key` is a stable namespace string.
- The algorithm does not require keeping a global index; it is O(1) per entity.

## Backwards Compatibility
- When `round_robin_bucket_execution` is false (default), behavior is unchanged: connectors use the configured `bucket_id` as in prior versions.

## Versioning
- This spec is versioned independently from connector implementations. Material changes will bump the spec version (e.g., v1.1) and note migration steps.
