/**
 * Option<T> - Type-safe null safety for TypeScript
 * 
 * Represents a value that may or may not be present. This eliminates null pointer
 * exceptions and makes nullable value handling explicit and type-safe.
 * 
 * @template T The type of the contained value
 * 
 * @example
 * ```typescript
 * const findUser = (id: number): Option<User> => 
 *   users.find(u => u.id === id) ? Option.some(user) : Option.none();
 * 
 * const userName = findUser(123)
 *   .map(user => user.name)
 *   .filter(name => name.length > 0)
 *   .getOrElse('Anonymous');
 * ```
 */
export abstract class Option<T> {
  /**
   * Creates an Option containing the given value.
   * 
   * @param value The value to wrap
   * @returns An Option representing presence of the value
   */
  public static some<T>(value: T): Option<T> {
    return new Some(value);
  }

  /**
   * Creates an Option representing the absence of a value.
   * 
   * @returns An Option representing absence
   */
  public static none<T>(): Option<T> {
    return new None<T>();
  }

  /**
   * Creates an Option from a nullable value.
   * Returns Some if the value is not null/undefined, None otherwise.
   * 
   * @param value The nullable value
   * @returns An Option representing the value or absence
   */
  public static fromNullable<T>(value: T | null | undefined): Option<T> {
    return value != null ? Option.some(value) : Option.none<T>();
  }

  /**
   * Combines multiple Options into a single Option containing an array of values.
   * If any Option is None, the combined Option will be None.
   * 
   * @param options Array of Options to combine
   * @returns An Option containing either all values or None
   */
  public static combine<T>(options: readonly Option<T>[]): Option<readonly T[]> {
    const values: T[] = [];
    
    for (const option of options) {
      if (option.isNone()) {
        return Option.none<readonly T[]>();
      }
      values.push((option as Some<T>).value);
    }
    
    return Option.some(values as readonly T[]);
  }

  /**
   * Applies a function that returns an Option to each element of an array.
   * If all applications succeed, returns Some containing the results.
   * If any application fails, returns None.
   * 
   * @param values Array of values to process
   * @param fn Function that converts T to Option<U>
   * @returns Option containing array of results or None
   */
  public static traverse<T, U>(
    values: readonly T[], 
    fn: (value: T) => Option<U>
  ): Option<readonly U[]> {
    const results: U[] = [];
    
    for (const value of values) {
      const result = fn(value);
      if (result.isNone()) {
        return Option.none<readonly U[]>();
      }
      results.push((result as Some<U>).value);
    }
    
    return Option.some(results as readonly U[]);
  }

  /**
   * Checks if this Option contains a value.
   */
  public abstract isSome(): this is Some<T>;

  /**
   * Checks if this Option represents absence of a value.
   */
  public abstract isNone(): this is None<T>;

  /**
   * Transforms the contained value using the provided function.
   * If this Option is None, returns None unchanged.
   * 
   * @param fn Function to transform the contained value
   * @returns A new Option with the transformed value
   */
  public abstract map<U>(fn: (value: T) => U): Option<U>;

  /**
   * Chains this Option with another operation that returns an Option.
   * If this Option is None, returns None unchanged.
   * 
   * @param fn Function that takes the contained value and returns a new Option
   * @returns The Option returned by fn, or None
   */
  public abstract flatMap<U>(fn: (value: T) => Option<U>): Option<U>;

  /**
   * Filters the contained value using a predicate.
   * Returns None if the predicate returns false or if this Option is None.
   * 
   * @param predicate Function to test the contained value
   * @returns This Option if predicate returns true, None otherwise
   */
  public abstract filter(predicate: (value: T) => boolean): Option<T>;

  /**
   * Checks if the contained value satisfies a predicate.
   * Returns false if this Option is None.
   * 
   * @param predicate Function to test the contained value
   * @returns True if predicate returns true for the contained value
   */
  public abstract exists(predicate: (value: T) => boolean): boolean;

  /**
   * Checks if the contained value satisfies a predicate.
   * Returns true if this Option is None (vacuous truth).
   * 
   * @param predicate Function to test the contained value
   * @returns True if predicate returns true or if this Option is None
   */
  public abstract forAll(predicate: (value: T) => boolean): boolean;

  /**
   * Pattern matches on the Option, calling one of the provided functions.
   * 
   * @param onSome Function to call if this contains a value
   * @param onNone Function to call if this is None
   * @returns The result of calling the appropriate function
   */
  public abstract match<U>(onSome: (value: T) => U, onNone: () => U): U;

  /**
   * Returns the contained value, or the provided default if this is None.
   * 
   * @param defaultValue Value to return if this is None
   * @returns The contained value or the default
   */
  public abstract getOrElse(defaultValue: T | (() => T)): T;

  /**
   * Returns this Option if it contains a value, otherwise returns the alternative.
   * 
   * @param alternative Option to return if this is None
   * @returns This Option or the alternative
   */
  public abstract orElse(alternative: Option<T>): Option<T>;

  /**
   * Unwraps the contained value, throwing an error if this is None.
   * Use sparingly - prefer getOrElse() or match() for safer handling.
   * 
   * @returns The contained value
   * @throws Error if this is None
   */
  public abstract unwrap(): T;

  /**
   * Converts this Option to an array.
   * Returns an array with one element if Some, empty array if None.
   * 
   * @returns Array containing the value or empty array
   */
  public abstract toArray(): T[];
}

/**
 * Internal class representing an Option containing a value.
 * Users should not construct this directly - use Option.some() instead.
 */
class Some<T> extends Option<T> {
  public readonly value: T;
  
  constructor(value: T) {
    super();
    // Deep clone the value to ensure immutability (functional purity)
    this.value = value instanceof Error 
      ? new Error(value.message) as T
      : (Array.isArray(value)
        ? [...value] as T
        : (typeof value === 'object' && value !== null
          ? { ...value } as T 
          : value));
  }

  public isSome(): this is Some<T> {
    return true;
  }

  public isNone(): this is None<T> {
    return false;
  }

  public map<U>(fn: (value: T) => U): Option<U> {
    return new LazySome(this.value, fn);
  }

  public flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    try {
      return fn(this.value);
    } catch (error) {
      return Option.none<U>();
    }
  }

  public filter(predicate: (value: T) => boolean): Option<T> {
    try {
      return predicate(this.value) ? this : Option.none<T>();
    } catch (error) {
      return Option.none<T>();
    }
  }

  public exists(predicate: (value: T) => boolean): boolean {
    try {
      return predicate(this.value);
    } catch (error) {
      return false;
    }
  }

  public forAll(predicate: (value: T) => boolean): boolean {
    try {
      return predicate(this.value);
    } catch (error) {
      return false;
    }
  }

  public match<U>(onSome: (value: T) => U, _onNone: () => U): U {
    return onSome(this.value);
  }

  public getOrElse(_defaultValue: T | (() => T)): T {
    return this.value;
  }

  public orElse(_alternative: Option<T>): Option<T> {
    return this;
  }

  public unwrap(): T {
    return this.value;
  }

  public toArray(): T[] {
    return [this.value];
  }
}

/**
 * Internal class representing a lazy Option with deferred computation.
 * The transformation function is only applied when the value is accessed.
 */
class LazySome<T, U> extends Option<U> {
  private _evaluated = false;
  private _value?: U;
  private _isNone = false;

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
      this._isNone = true;
    }
    this._evaluated = true;
  }

  public isSome(): this is Some<U> {
    this.evaluate();
    return !this._isNone;
  }

  public isNone(): this is None<U> {
    this.evaluate();
    return this._isNone;
  }

  public map<V>(fn: (value: U) => V): Option<V> {
    // Chain lazy evaluations
    return new LazySome(this.sourceValue, (source: T) => {
      const intermediate = this.transform(source);
      return fn(intermediate);
    });
  }

  public flatMap<V>(fn: (value: U) => Option<V>): Option<V> {
    this.evaluate();
    if (this._isNone) {
      return Option.none<V>();
    }
    try {
      return fn(this._value!);
    } catch (error) {
      return Option.none<V>();
    }
  }

  public filter(predicate: (value: U) => boolean): Option<U> {
    this.evaluate();
    if (this._isNone) {
      return Option.none<U>();
    }
    try {
      return predicate(this._value!) ? this as Option<U> : Option.none<U>();
    } catch (error) {
      return Option.none<U>();
    }
  }

  public exists(predicate: (value: U) => boolean): boolean {
    this.evaluate();
    if (this._isNone) {
      return false;
    }
    try {
      return predicate(this._value!);
    } catch (error) {
      return false;
    }
  }

  public forAll(predicate: (value: U) => boolean): boolean {
    this.evaluate();
    if (this._isNone) {
      return true; // Vacuous truth
    }
    try {
      return predicate(this._value!);
    } catch (error) {
      return false;
    }
  }

  public match<V>(onSome: (value: U) => V, onNone: () => V): V {
    this.evaluate();
    if (this._isNone) {
      return onNone();
    }
    return onSome(this._value!);
  }

  public getOrElse(defaultValue: U | (() => U)): U {
    this.evaluate();
    if (this._isNone) {
      return typeof defaultValue === 'function' ? (defaultValue as () => U)() : defaultValue;
    }
    return this._value!;
  }

  public orElse(alternative: Option<U>): Option<U> {
    this.evaluate();
    if (this._isNone) {
      return alternative;
    }
    return this as Option<U>;
  }

  public unwrap(): U {
    this.evaluate();
    if (this._isNone) {
      throw new Error('Called unwrap on None');
    }
    return this._value!;
  }

  public toArray(): U[] {
    this.evaluate();
    if (this._isNone) {
      return [];
    }
    return [this._value!];
  }
}

/**
 * Internal class representing an Option with no value.
 * Users should not construct this directly - use Option.none() instead.
 */
class None<T> extends Option<T> {
  public isSome(): this is Some<T> {
    return false;
  }

  public isNone(): this is None<T> {
    return true;
  }

  public map<U>(_fn: (value: T) => U): Option<U> {
    return new None<U>();
  }

  public flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return new None<U>();
  }

  public filter(_predicate: (value: T) => boolean): Option<T> {
    return this;
  }

  public exists(_predicate: (value: T) => boolean): boolean {
    return false;
  }

  public forAll(_predicate: (value: T) => boolean): boolean {
    return true; // Vacuous truth
  }

  public match<U>(_onSome: (value: T) => U, onNone: () => U): U {
    return onNone();
  }

  public getOrElse(defaultValue: T | (() => T)): T {
    return typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue;
  }

  public orElse(alternative: Option<T>): Option<T> {
    return alternative;
  }

  public unwrap(): T {
    throw new Error('Called unwrap on None');
  }

  public toArray(): T[] {
    return [];
  }
}

/**
 * Type guard to check if an Option contains a value.
 * 
 * @param option The Option to check
 * @returns True if the Option contains a value
 */
export function isSome<T>(option: Option<T>): option is Some<T> {
  return option.isSome();
}

/**
 * Type guard to check if an Option represents absence.
 * 
 * @param option The Option to check
 * @returns True if the Option represents absence
 */
export function isNone<T>(option: Option<T>): option is None<T> {
  return option.isNone();
}

/**
 * Utility function to safely access object properties.
 * 
 * @param obj The object to access
 * @param key The property key
 * @returns An Option containing the property value or None
 * 
 * @example
 * ```typescript
 * const user = { name: 'John', age: 30 };
 * const name = safeProp(user, 'name'); // Some('John')
 * const city = safeProp(user, 'city'); // None
 * ```
 */
export function safeProp<T, K extends keyof T>(obj: T, key: K): Option<T[K]> {
  return Option.fromNullable(obj[key]);
}

/**
 * Utility function to safely access nested object properties.
 * 
 * @param obj The object to access
 * @param path Array of property keys representing the path
 * @returns An Option containing the nested value or None
 * 
 * @example
 * ```typescript
 * const user = { profile: { avatar: { url: 'image.jpg' } } };
 * const url = safeGet(user, ['profile', 'avatar', 'url']); // Some('image.jpg')
 * ```
 */
export function safeGet<T>(obj: T, path: string[]): Option<unknown> {
  let current: any = obj;
  
  for (const key of path) {
    const option = Option.fromNullable(current?.[key]);
    if (option.isNone()) {
      return Option.none();
    }
    current = (option as Some<unknown>).value;
  }
  
  return Option.some(current);
}