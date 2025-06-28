# Generic State Manager System

This directory contains a flexible and type-safe state management system for Airbyte incremental sync streams. It eliminates code duplication and provides consistent state handling patterns across all sources.

## Overview

The state manager system provides a generic approach to handling incremental sync state, supporting configurable field extraction and key generation strategies. This allows streams to focus on their core logic while delegating state management to reusable, well-tested components.

## Key Components

### 1. Core Interfaces (`interfaces.ts`)

- **`StateManager<TState, TRecord, TSlice>`**: Generic interface for managing stream state
- **`FieldExtractor<TRecord, TFieldValue>`**: Interface for extracting cursor field values from records
- **`KeyGenerator<TSlice>`**: Interface for generating state keys from stream slices
- **`TimestampStateConfig<TRecord, TSlice>`**: Configuration for timestamp-based state management

### 2. Field Extractors (`field-extractors.ts`)

- **`TimestampFieldExtractor`**: Extracts timestamp fields and normalizes to Date objects
- **`NestedTimestampFieldExtractor`**: Handles nested timestamp fields (e.g., `committer.date`)
- **`PathFieldExtractor`**: Generic field extraction by property path
- **`FieldExtractors`**: Factory class with convenience methods

### 3. Key Generators (`key-generators.ts`)

- **`OrgRepoKeyGenerator`**: For GitHub-style `org/repo` patterns
- **`GroupProjectKeyGenerator`**: For GitLab-style `group_id/path_with_namespace` patterns
- **`ProjectKeyGenerator`**: For simple project key patterns (Jira)
- **`FunctionKeyGenerator`**: For custom key generation logic
- **`KeyGenerators`**: Factory class with convenience methods

### 4. State Manager (`timestamp-state-manager.ts`)

- **`TimestampStateManager`**: Main implementation for timestamp-based incremental sync
- Handles cutoff lag adjustment
- Replicates existing `calculateUpdatedStreamState` logic
- Type-safe and configurable

### 5. Factory (`factory.ts`)

- **`StateManagerFactory`**: Pre-configured state managers for common patterns:
  - `github()`: For GitHub streams with timestamp fields
  - `githubCommits()`: For GitHub commits with nested `committer.date`
  - `gitlab()`: For GitLab streams with timestamp fields
  - `jira()`: For Jira streams with project keys
  - `custom()`: For custom configurations

## Usage Examples

### Before (Manual Implementation)

```typescript
export class FarosCommits extends StreamWithProjectSlices {
  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosCommitOutput,
    slice: ProjectStreamSlice,
  ): StreamState {
    const latestRecordCutoff = Utils.toDate(latestRecord?.created_at ?? 0);
    return this.getUpdatedStreamState(
      latestRecordCutoff,
      currentStreamState,
      StreamBase.groupProjectKey(slice.group_id, slice.path_with_namespace),
    );
  }
}
```

### After (Generic State Manager)

```typescript
export class FarosCommits extends StreamWithProjectSlices {
  // Initialize state manager for GitLab commits using created_at field
  private readonly stateManager = StateManagerFactory.gitlab<FarosCommitOutput, ProjectStreamSlice>('created_at');

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosCommitOutput,
    slice: ProjectStreamSlice,
  ): StreamState {
    // Use the new generic state manager instead of manual implementation
    return this.stateManager.getUpdatedState(currentStreamState, latestRecord, slice);
  }
}
```

### Custom Configuration

```typescript
export class CustomStream extends StreamBase {
  private readonly stateManager = StateManagerFactory.custom({
    fieldExtractor: FieldExtractors.timestamp('last_modified'),
    keyGenerator: KeyGenerators.custom(slice => `${slice.tenant}:${slice.workspace}`),
    cutoffLagDays: 1
  });

  getUpdatedState(currentStreamState, latestRecord, slice) {
    return this.stateManager.getUpdatedState(currentStreamState, latestRecord, slice);
  }
}
```

## Benefits

1. **Eliminates Code Duplication**: Common state management logic is centralized
2. **Type Safety**: Full TypeScript support with generics
3. **Consistency**: All streams use the same proven state management logic
4. **Flexibility**: Configurable field extraction and key generation
5. **Reusability**: Easy to extend for new patterns and sources
6. **Backward Compatibility**: Maintains existing behavior exactly

## Migration Guide

1. Import the state manager factory and types
2. Add a private state manager property to your stream class
3. Replace manual `getUpdatedState` implementation with a call to the state manager
4. Choose the appropriate factory method or create a custom configuration
5. Test to ensure behavior matches the original implementation

## Testing

The state manager has been tested with mock data to ensure it produces identical results to the original manual implementations. The core logic replicates the existing `calculateUpdatedStreamState` function exactly.