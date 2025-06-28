import {KeyGenerator} from './interfaces';

/**
 * Helper function to convert string to lowercase (similar to lodash toLower)
 */
function toLower(str: string): string {
  return str.toLowerCase();
}

/**
 * Base key generator that applies common transformations
 */
abstract class BaseKeyGenerator<TSlice> implements KeyGenerator<TSlice> {
  abstract generateKey(slice: TSlice): string;

  protected normalize(key: string): string {
    return toLower(key);
  }
}

/**
 * Key generator for GitHub-style org/repo slices
 */
export class OrgRepoKeyGenerator<TSlice extends {org: string; repo: string}> 
  extends BaseKeyGenerator<TSlice> {
  
  generateKey(slice: TSlice): string {
    return this.normalize(`${slice.org}/${slice.repo}`);
  }
}

/**
 * Key generator for GitLab-style group/project slices
 */
export class GroupProjectKeyGenerator<TSlice extends {group_id: string; path_with_namespace: string}> 
  extends BaseKeyGenerator<TSlice> {
  
  generateKey(slice: TSlice): string {
    return this.normalize(`${slice.group_id}/${slice.path_with_namespace}`);
  }
}

/**
 * Key generator for simple project key slices
 */
export class ProjectKeyGenerator<TSlice extends {project: string}> 
  extends BaseKeyGenerator<TSlice> {
  
  generateKey(slice: TSlice): string {
    return this.normalize(slice.project);
  }
}

/**
 * Generic key generator that uses a custom function
 */
export class FunctionKeyGenerator<TSlice> extends BaseKeyGenerator<TSlice> {
  constructor(private readonly keyFunction: (slice: TSlice) => string) {
    super();
  }

  generateKey(slice: TSlice): string {
    return this.normalize(this.keyFunction(slice));
  }
}

/**
 * Factory methods for common key generators
 */
export class KeyGenerators {
  /**
   * Create key generator for GitHub org/repo pattern
   */
  static orgRepo<TSlice extends {org: string; repo: string}>(): OrgRepoKeyGenerator<TSlice> {
    return new OrgRepoKeyGenerator();
  }

  /**
   * Create key generator for GitLab group/project pattern
   */
  static groupProject<TSlice extends {group_id: string; path_with_namespace: string}>(): GroupProjectKeyGenerator<TSlice> {
    return new GroupProjectKeyGenerator();
  }

  /**
   * Create key generator for simple project key pattern
   */
  static project<TSlice extends {project: string}>(): ProjectKeyGenerator<TSlice> {
    return new ProjectKeyGenerator();
  }

  /**
   * Create key generator with custom function
   */
  static custom<TSlice>(keyFunction: (slice: TSlice) => string): FunctionKeyGenerator<TSlice> {
    return new FunctionKeyGenerator(keyFunction);
  }
}