# GitLab Source

This is the repository for the GitLab source connector, written in TypeScript.

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

## Bucketing Support

This connector implements bucketing and round-robin execution as specified in the [Bucketing and Round-Robin Execution Spec](../../docs/specs/bucketing_round_robin_spec.md).

Projects are deterministically assigned to buckets based on their `{group}/{project}` path, ensuring consistent partitioning across sync instances and runs.