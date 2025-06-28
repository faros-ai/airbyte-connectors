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
 * Factory methods for key generators
 */
export class KeyGenerators {
  /**
   * Create key generator with custom function
   */
  static custom<TSlice>(keyFunction: (slice: TSlice) => string): FunctionKeyGenerator<TSlice> {
    return new FunctionKeyGenerator(keyFunction);
  }
}