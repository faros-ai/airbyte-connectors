# Generic State Manager System

This directory contains a flexible and type-safe state management system for Airbyte incremental sync streams. It provides source-agnostic building blocks that eliminate code duplication and ensure consistent state handling patterns across all sources.

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

- **`FunctionKeyGenerator`**: Generic key generator using custom functions
- **`KeyGenerators`**: Factory class with convenience methods for custom key generation

### 4. State Manager (`timestamp-state-manager.ts`)

- **`TimestampStateManager`**: Main implementation for timestamp-based incremental sync
- Handles cutoff lag adjustment
- Replicates existing `calculateUpdatedStreamState` logic
- Type-safe and configurable

### 5. Factory (`factory.ts`)

- **`StateManagerFactory`**: Creates state managers with custom configurations
  - `create()`: For creating state managers with custom configurations

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
  // Initialize state manager using generic configuration
  private readonly stateManager = StateManagerFactory.create<FarosCommitOutput, ProjectStreamSlice>({
    fieldExtractor: FieldExtractors.timestamp<FarosCommitOutput>('created_at'),
    keyGenerator: KeyGenerators.custom<ProjectStreamSlice>((slice) => `${slice.group_id}/${slice.path_with_namespace}`)
  });

  getUpdatedState(
    currentStreamState: StreamState,
    latestRecord: FarosCommitOutput,
    slice: ProjectStreamSlice,
  ): StreamState {
    return this.stateManager.getUpdatedState(currentStreamState, latestRecord, slice);
  }
}
```

### Custom Configuration Examples

```typescript
// GitHub-style org/repo pattern
export class GitHubIssuesStream extends StreamBase {
  private readonly stateManager = StateManagerFactory.create({
    fieldExtractor: FieldExtractors.timestamp('updated_at'),
    keyGenerator: KeyGenerators.custom(slice => `${slice.org}/${slice.repo}`),
    cutoffLagDays: 1
  });
}

// Jira-style project pattern
export class JiraIssuesStream extends StreamBase {
  private readonly stateManager = StateManagerFactory.create({
    fieldExtractor: FieldExtractors.timestamp('updated'),
    keyGenerator: KeyGenerators.custom(slice => slice.project),
    cutoffLagDays: 0
  });
}

// Complex nested field extraction
export class GitHubCommitsStream extends StreamBase {
  private readonly stateManager = StateManagerFactory.create({
    fieldExtractor: FieldExtractors.nestedTimestamp('committer.date'),
    keyGenerator: KeyGenerators.custom(slice => `${slice.org}/${slice.repo}`)
  });
}
```

## Benefits

1. **Source Agnostic**: Provides generic building blocks without prescriptive patterns
2. **Eliminates Code Duplication**: Common state management logic is centralized
3. **Type Safety**: Full TypeScript support with generics
4. **Consistency**: All streams use the same proven state management logic
5. **Flexibility**: Configurable field extraction and key generation
6. **Reusability**: Easy to extend for new patterns and sources
7. **Backward Compatibility**: Maintains existing behavior exactly

## Migration Guide

1. Import the state manager factory and types
2. Add a private state manager property to your stream class
3. Configure field extraction and key generation for your specific source
4. Replace manual `getUpdatedState` implementation with a call to the state manager
5. Test to ensure behavior matches the original implementation

## Source-Specific Patterns

Each source can define its own helper functions or factories that use the generic building blocks:

```typescript
// In your source's utilities file
export class GitLabStateManager {
  static forTimestampField<TRecord>(timestampField: string, cutoffLagDays?: number) {
    return StateManagerFactory.create<TRecord, ProjectStreamSlice>({
      fieldExtractor: FieldExtractors.timestamp<TRecord>(timestampField),
      keyGenerator: KeyGenerators.custom<ProjectStreamSlice>((slice) => `${slice.group_id}/${slice.path_with_namespace}`),
      cutoffLagDays
    });
  }
}
```

## Testing

The state manager has been tested with mock data to ensure it produces identical results to the original manual implementations. The core logic replicates the existing `calculateUpdatedStreamState` function exactly.