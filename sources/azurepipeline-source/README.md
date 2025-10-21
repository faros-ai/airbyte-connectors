# Azure Pipeline Source

This is the repository for the Azure Pipeline source connector, written in TypeScript.

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

## Bucketing Support

This connector implements bucketing and round-robin execution as specified in the [Bucketing and Round-Robin Execution Spec](../../docs/specs/bucketing_round_robin_spec.md).

Pipelines are deterministically assigned to buckets based on their `{projectName}:{pipelineName}` path, ensuring consistent partitioning across sync instances and runs.