import {FieldExtractors} from './field-extractors';
import {TimestampStateConfig} from './interfaces';
import {KeyGenerators} from './key-generators';
import {TimestampStateManager} from './timestamp-state-manager';

/**
 * Factory class for creating pre-configured state managers for common patterns
 */
export class StateManagerFactory {
  /**
   * Create state manager for GitHub-style streams (org/repo with timestamp field)
   */
  static github<TRecord, TSlice extends {org: string; repo: string}>(
    timestampField: string,
    cutoffLagDays?: number
  ): TimestampStateManager<TRecord, TSlice> {
    const config: TimestampStateConfig<TRecord, TSlice> = {
      fieldExtractor: FieldExtractors.timestamp<TRecord>(timestampField),
      keyGenerator: KeyGenerators.orgRepo<TSlice>(),
      cutoffLagDays
    };
    return new TimestampStateManager(config);
  }

  /**
   * Create state manager for GitHub commits (with nested committer.date field)
   */
  static githubCommits<TRecord, TSlice extends {org: string; repo: string}>(
    cutoffLagDays?: number
  ): TimestampStateManager<TRecord, TSlice> {
    const config: TimestampStateConfig<TRecord, TSlice> = {
      fieldExtractor: FieldExtractors.nestedTimestamp<TRecord>('committer.date'),
      keyGenerator: KeyGenerators.orgRepo<TSlice>(),
      cutoffLagDays
    };
    return new TimestampStateManager(config);
  }

  /**
   * Create state manager for GitLab-style streams (group/project with timestamp field)
   */
  static gitlab<TRecord, TSlice extends {group_id: string; path_with_namespace: string}>(
    timestampField: string,
    cutoffLagDays?: number
  ): TimestampStateManager<TRecord, TSlice> {
    const config: TimestampStateConfig<TRecord, TSlice> = {
      fieldExtractor: FieldExtractors.timestamp<TRecord>(timestampField),
      keyGenerator: KeyGenerators.groupProject<TSlice>(),
      cutoffLagDays
    };
    return new TimestampStateManager(config);
  }

  /**
   * Create state manager for Jira-style streams (project key with timestamp field)
   */
  static jira<TRecord, TSlice extends {project: string}>(
    timestampField: string,
    cutoffLagDays?: number
  ): TimestampStateManager<TRecord, TSlice> {
    const config: TimestampStateConfig<TRecord, TSlice> = {
      fieldExtractor: FieldExtractors.timestamp<TRecord>(timestampField),
      keyGenerator: KeyGenerators.project<TSlice>(),
      cutoffLagDays
    };
    return new TimestampStateManager(config);
  }

  /**
   * Create state manager with custom configuration
   */
  static custom<TRecord, TSlice>(
    config: TimestampStateConfig<TRecord, TSlice>
  ): TimestampStateManager<TRecord, TSlice> {
    return new TimestampStateManager(config);
  }
}