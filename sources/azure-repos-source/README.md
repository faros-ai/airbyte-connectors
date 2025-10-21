# Azure-Repos Source

This is the repository for the Azure-Repos source connector, written in Typescript.

For common build, test, and run instructions, see the [common source documentation](../README.md#common-development-instructions).

## Required Permissions

The Azure-Repos source connector requires the following permissions:

- vso.code,vso.profile,vso.project

## Streams

| Name     | Full | Incremental | Required Permissions |
|-----------|---|---|---|
| Commits | ✅ | ✅ | vso.code,vso.profile,vso.project |
| Pull Requests | ✅ | ✅ | vso.code,vso.profile,vso.project |
| Repositories | ✅ |  | vso.code,vso.profile,vso.project |
| Users     | ✅ |   | Cloud - vso.graph / Server - vso.profile,vso.project |

## Bucketing Support

This connector implements bucketing and round-robin execution as specified in the [Bucketing and Round-Robin Execution Spec](../../docs/specs/bucketing_round_robin_spec.md).

Repositories are deterministically assigned to buckets based on their `{projectName}:{repoName}` path, ensuring consistent partitioning across sync instances and runs.