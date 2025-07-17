/**
 * Result<T, E> - Type-safe error handling for TypeScript
 * 
 * Represents the result of an operation that can either succeed with a value of type T
 * or fail with an error of type E. This eliminates the need for exceptions in business logic
 * and makes error handling explicit and type-safe.
 * 
 * @template T The type of the success value
 * @template E The type of the error value
 * 
 * @example
 * ```typescript
 * const divide = (x: number, y: number): Result<number, string> =>
 *   y === 0 ? Result.failure('Division by zero') : Result.success(x / y);
 * 
 * const result = Result.success(10)
 *   .flatMap(x => divide(x, 2))
 *   .map(x => x.toString());
 * 
 * result.match(
 *   value => console.log(`Success: ${value}`),
 *   error => console.error(`Error: ${error}`)
 * );
 * ```
 */
export abstract class Result<T, E> {
  /**
   * Creates a successful Result containing the given value.
   * 
   * @param value The success value
   * @returns A Result representing success
   */
  public static success<T, E>(value: T): Result<T, E> {
    return new Success(value);
  }

  /**
   * Creates a failed Result containing the given error.
   * 
   * @param error The error value
   * @returns A Result representing failure
   */
  public static failure<T, E>(error: E): Result<T, E> {
    return new Failure(error);
  }

  /**
   * Combines multiple Results into a single Result containing an array of values.
   * If any Result is a failure, the combined Result will be a failure.
   * 
   * @param results Array of Results to combine
   * @returns A Result containing either all values or the first error
   */
  public static combine<T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> {
    const values: T[] = [];
    
    for (const result of results) {
      if (result.isFailure()) {
        return result as Result<readonly T[], E>;
      }
      values.push((result as Success<T, E>).value);
    }
    
    return Result.success(values as readonly T[]);
  }

  /**
   * Checks if this Result represents a success.
   */
  public abstract isSuccess(): this is Success<T, E>;

  /**
   * Checks if this Result represents a failure.
   */
  public abstract isFailure(): this is Failure<T, E>;

  /**
   * Transforms the success value using the provided function.
   * If this Result is a failure, returns the failure unchanged.
   * 
   * @param fn Function to transform the success value
   * @returns A new Result with the transformed value
   */
  public abstract map<U>(fn: (value: T) => U): Result<U, E>;

  /**
   * Transforms the error value using the provided function.
   * If this Result is a success, returns the success unchanged.
   * 
   * @param fn Function to transform the error value
   * @returns A new Result with the transformed error
   */
  public abstract mapError<F>(fn: (error: E) => F): Result<T, F>;

  /**
   * Chains this Result with another operation that returns a Result.
   * If this Result is a failure, returns the failure unchanged.
   * 
   * @param fn Function that takes the success value and returns a new Result
   * @returns The Result returned by fn, or this failure
   */
  public abstract flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;

  /**
   * Pattern matches on the Result, calling one of the provided functions.
   * 
   * @param onSuccess Function to call if this is a success
   * @param onFailure Function to call if this is a failure
   * @returns The result of calling the appropriate function
   */
  public abstract match<U>(onSuccess: (value: T) => U, onFailure: (error: E) => U): U;

  /**
   * Unwraps the success value, throwing an error if this is a failure.
   * Use sparingly - prefer match() for safer error handling.
   * 
   * @returns The success value
   * @throws The error value if this is a failure
   */
  public abstract unwrap(): T;

  /**
   * Returns the success value, or the provided default if this is a failure.
   * 
   * @param defaultValue Value to return if this is a failure
   * @returns The success value or the default
   */
  public abstract unwrapOr(defaultValue: T): T;
}

/**
 * Internal class representing a successful Result.
 * Users should not construct this directly - use Result.success() instead.
 */
class Success<T, E> extends Result<T, E> {
  constructor(public readonly value: T) {
    super();
  }

  public isSuccess(): this is Success<T, E> {
    return true;
  }

  public isFailure(): this is Failure<T, E> {
    return false;
  }

  public map<U>(fn: (value: T) => U): Result<U, E> {
    // Return a lazy Result that only evaluates when accessed
    return new LazySuccess(this.value, fn);
  }

  public mapError<F>(_fn: (error: E) => F): Result<T, F> {
    return this as unknown as Result<T, F>;
  }

  public flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    try {
      return fn(this.value);
    } catch (error) {
      return Result.failure(error as E);
    }
  }

  public match<U>(onSuccess: (value: T) => U, _onFailure: (error: E) => U): U {
    return onSuccess(this.value);
  }

  public unwrap(): T {
    return this.value;
  }

  public unwrapOr(_defaultValue: T): T {
    return this.value;
  }
}

/**
 * Internal class representing a lazy successful Result.
 * The transformation function is only applied when the value is accessed.
 */
class LazySuccess<T, U, E> extends Result<U, E> {
  private _evaluated = false;
  private _value?: U;
  private _error?: E;

  constructor(
    private readonly sourceValue: T,
    private readonly transform: (value: T) => U
  ) {
    super();
  }

  private evaluate(): void {
    if (this._evaluated) return;
    
    try {
      this._value = this.transform(this.sourceValue);
    } catch (error) {
      this._error = error as E;
    }
    this._evaluated = true;
  }

  public isSuccess(): this is Success<U, E> {
    this.evaluate();
    return this._error === undefined;
  }

  public isFailure(): this is Failure<U, E> {
    this.evaluate();
    return this._error !== undefined;
  }

  public map<V>(fn: (value: U) => V): Result<V, E> {
    // Chain lazy evaluations
    return new LazySuccess(this.sourceValue, (source: T) => {
      const intermediate = this.transform(source);
      return fn(intermediate);
    });
  }

  public mapError<F>(fn: (error: E) => F): Result<U, F> {
    this.evaluate();
    if (this._error !== undefined) {
      return Result.failure(fn(this._error));
    }
    return this as unknown as Result<U, F>;
  }

  public flatMap<V>(fn: (value: U) => Result<V, E>): Result<V, E> {
    this.evaluate();
    if (this._error !== undefined) {
      return Result.failure(this._error);
    }
    try {
      return fn(this._value!);
    } catch (error) {
      return Result.failure(error as E);
    }
  }

  public match<V>(onSuccess: (value: U) => V, onFailure: (error: E) => V): V {
    this.evaluate();
    if (this._error !== undefined) {
      return onFailure(this._error);
    }
    return onSuccess(this._value!);
  }

  public unwrap(): U {
    this.evaluate();
    if (this._error !== undefined) {
      if (this._error instanceof Error) {
        throw this._error;
      }
      throw new Error(String(this._error));
    }
    return this._value!;
  }

  public unwrapOr(defaultValue: U): U {
    this.evaluate();
    if (this._error !== undefined) {
      return defaultValue;
    }
    return this._value!;
  }
}

/**
 * Internal class representing a failed Result.
 * Users should not construct this directly - use Result.failure() instead.
 */
class Failure<T, E> extends Result<T, E> {
  public readonly error: E;
  
  constructor(error: E) {
    super();
    // Deep clone the error to ensure immutability (functional purity)
    this.error = error instanceof Error 
      ? new Error(error.message) as E
      : (typeof error === 'object' && error !== null 
        ? { ...error } as E 
        : error);
  }

  public isSuccess(): this is Success<T, E> {
    return false;
  }

  public isFailure(): this is Failure<T, E> {
    return true;
  }

  public map<U>(_fn: (value: T) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  public mapError<F>(fn: (error: E) => F): Result<T, F> {
    try {
      return Result.failure(fn(this.error));
    } catch (error) {
      return Result.failure(error as F);
    }
  }

  public flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  public match<U>(_onSuccess: (value: T) => U, onFailure: (error: E) => U): U {
    return onFailure(this.error);
  }

  public unwrap(): T {
    if (this.error instanceof Error) {
      throw this.error;
    }
    throw new Error(String(this.error));
  }

  public unwrapOr(defaultValue: T): T {
    return defaultValue;
  }
}

/**
 * Type guard to check if a Result is a Success.
 * 
 * @param result The Result to check
 * @returns True if the Result is a Success
 */
export function isSuccess<T, E>(result: Result<T, E>): result is Success<T, E> {
  return result.isSuccess();
}

/**
 * Type guard to check if a Result is a Failure.
 * 
 * @param result The Result to check
 * @returns True if the Result is a Failure
 */
export function isFailure<T, E>(result: Result<T, E>): result is Failure<T, E> {
  return result.isFailure();
}

/**
 * Utility function to wrap a potentially throwing function in a Result.
 * 
 * @param fn Function that might throw
 * @returns A Result representing the function's success or failure
 * 
 * @example
 * ```typescript
 * const parseJson = (json: string): Result<unknown, Error> =>
 *   tryCatch(() => JSON.parse(json));
 * ```
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return Result.success(fn());
  } catch (error) {
    return Result.failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Utility function to wrap an async function in a Result.
 * 
 * @param fn Async function that might reject
 * @returns A Promise of a Result representing the function's success or failure
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    const value = await fn();
    return Result.success(value);
  } catch (error) {
    return Result.failure(error instanceof Error ? error : new Error(String(error)));
  }
}