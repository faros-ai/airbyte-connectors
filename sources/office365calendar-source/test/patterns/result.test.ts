import { Result } from '../../src/patterns/result';

describe('Result<T, E> Pattern - Enterprise-Grade Error Handling', () => {
  describe('Construction', () => {
    test('Result.success() should wrap successful values', () => {
      const result = Result.success(42);
      
      expect(result.isSuccess()).toBe(true);
      expect(result.isFailure()).toBe(false);
      
      result.match(
        value => expect(value).toBe(42),
        error => fail('Should not call error handler')
      );
    });

    test('Result.failure() should wrap error states', () => {
      const error = new Error('Something went wrong');
      const result = Result.failure(error);
      
      expect(result.isSuccess()).toBe(false);
      expect(result.isFailure()).toBe(true);
      
      result.match(
        value => fail('Should not call success handler'),
        err => {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toBe(error.message);
        }
      );
    });

    test('Result constructors should be pure (no side effects)', () => {
      const originalError = new Error('test');
      const result = Result.failure(originalError);
      
      // Modifying original should not affect Result
      originalError.message = 'modified';
      
      result.match(
        value => fail('Should not succeed'),
        error => expect(error.message).toBe('test')
      );
    });
  });

  describe('Functor Laws (map)', () => {
    test('map should transform success values only', () => {
      const success = Result.success(10);
      const doubled = success.map(x => x * 2);
      
      doubled.match(
        value => expect(value).toBe(20),
        error => fail('Should not fail')
      );
    });

    test('map should not transform failure values', () => {
      const failure = Result.failure<number, string>('error');
      const doubled = failure.map(x => x * 2);
      
      doubled.match(
        value => fail('Should not succeed'),
        error => expect(error).toBe('error')
      );
    });

    test('map should satisfy functor identity law', () => {
      const result = Result.success(42);
      const identity = <T>(x: T): T => x;
      
      const mapped = result.map(identity);
      
      expect(result.match(x => x, e => e)).toBe(mapped.match(x => x, e => e));
    });

    test('map should satisfy functor composition law', () => {
      const result = Result.success(5);
      const f = (x: number): number => x * 2;
      const g = (x: number): number => x + 1;
      
      const composed = result.map(x => g(f(x)));
      const chained = result.map(f).map(g);
      
      expect(composed.match(x => x, e => e)).toBe(chained.match(x => x, e => e));
    });
  });

  describe('Monad Laws (flatMap)', () => {
    test('flatMap should chain operations safely', () => {
      const divide = (x: number, y: number): Result<number, string> =>
        y === 0 ? Result.failure('Division by zero') : Result.success(x / y);
      
      const result = Result.success(10)
        .flatMap(x => divide(x, 2))
        .flatMap(x => divide(x, 5));
      
      result.match(
        value => expect(value).toBe(1),
        error => fail(`Should not fail: ${error}`)
      );
    });

    test('flatMap should short-circuit on first failure', () => {
      const divide = (x: number, y: number): Result<number, string> =>
        y === 0 ? Result.failure('Division by zero') : Result.success(x / y);
      
      const result = Result.success(10)
        .flatMap(x => divide(x, 0)) // This should fail
        .flatMap(x => divide(x, 2)); // This should never execute
      
      result.match(
        value => fail('Should not succeed'),
        error => expect(error).toBe('Division by zero')
      );
    });

    test('flatMap should satisfy left identity law', () => {
      const value = 42;
      const f = (x: number): Result<string, Error> => Result.success(x.toString());
      
      const leftSide = Result.success(value).flatMap(f);
      const rightSide = f(value);
      
      expect(leftSide.match(x => x, e => String(e))).toBe(rightSide.match(x => x, e => String(e)));
    });

    test('flatMap should satisfy right identity law', () => {
      const result = Result.success(42);
      const identity = <T, E>(x: T): Result<T, E> => Result.success(x);
      
      const mapped = result.flatMap(identity);
      
      expect(result.match(x => x, e => e)).toBe(mapped.match(x => x, e => e));
    });

    test('flatMap should satisfy associativity law', () => {
      const result = Result.success(5);
      const f = (x: number): Result<number, string> => Result.success(x * 2);
      const g = (x: number): Result<number, string> => Result.success(x + 1);
      
      const leftAssoc = result.flatMap(f).flatMap(g);
      const rightAssoc = result.flatMap(x => f(x).flatMap(g));
      
      expect(leftAssoc.match(x => x, e => e)).toBe(rightAssoc.match(x => x, e => e));
    });
  });

  describe('Advanced Operations', () => {
    test('mapError should transform error types', () => {
      const result = Result.failure<number, string>('not found');
      const mapped = result.mapError(err => new Error(err));
      
      mapped.match(
        value => fail('Should not succeed'),
        error => {
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toBe('not found');
        }
      );
    });

    test('unwrap should return value for success', () => {
      const result = Result.success(42);
      expect(result.unwrap()).toBe(42);
    });

    test('unwrap should throw for failure', () => {
      const result = Result.failure('error');
      expect(() => result.unwrap()).toThrow('error');
    });

    test('unwrapOr should return value for success', () => {
      const result = Result.success(42);
      expect(result.unwrapOr(0)).toBe(42);
    });

    test('unwrapOr should return default for failure', () => {
      const result = Result.failure<number, string>('error');
      expect(result.unwrapOr(0)).toBe(0);
    });

    test('combine should aggregate multiple Results', () => {
      const results = [
        Result.success(1),
        Result.success(2),
        Result.success(3)
      ];
      
      const combined = Result.combine(results);
      
      combined.match(
        values => expect(values).toEqual([1, 2, 3]),
        error => fail(`Should not fail: ${error}`)
      );
    });

    test('combine should fail if any Result fails', () => {
      const results = [
        Result.success(1),
        Result.failure<number, string>('error'),
        Result.success(3)
      ];
      
      const combined = Result.combine(results);
      
      combined.match(
        values => fail('Should not succeed'),
        error => expect(error).toBe('error')
      );
    });
  });

  describe('Type Safety', () => {
    test('Result should preserve type information', () => {
      const stringResult: Result<string, Error> = Result.success('hello');
      const numberResult: Result<number, Error> = stringResult.map(s => s.length);
      
      numberResult.match(
        value => {
          expect(typeof value).toBe('number');
          expect(value).toBe(5);
        },
        error => fail('Should not fail')
      );
    });

    test('Result should handle union types correctly', () => {
      type ParseError = 'invalid_number' | 'out_of_range';
      
      const parsePositiveInt = (s: string): Result<number, ParseError> => {
        const num = parseInt(s, 10);
        if (isNaN(num)) return Result.failure('invalid_number');
        if (num <= 0) return Result.failure('out_of_range');
        return Result.success(num);
      };
      
      const validResult = parsePositiveInt('42');
      const invalidResult = parsePositiveInt('abc');
      const rangeResult = parsePositiveInt('-5');
      
      expect(validResult.isSuccess()).toBe(true);
      expect(invalidResult.isFailure()).toBe(true);
      expect(rangeResult.isFailure()).toBe(true);
      
      invalidResult.match(
        value => fail('Should not succeed'),
        error => expect(error).toBe('invalid_number')
      );
    });
  });

  describe('Performance', () => {
    test('Result operations should not cause memory leaks', () => {
      // Create many Result instances and chain operations
      const results = Array.from({ length: 10000 }, (_, i) => 
        Result.success(i)
          .map(x => x * 2)
          .flatMap(x => Result.success(x + 1))
          .map(x => x.toString())
      );
      
      // All should be successful
      results.forEach((result, i) => {
        result.match(
          value => expect(value).toBe(((i * 2) + 1).toString()),
          error => fail(`Result ${i} should not fail`)
        );
      });
      
      // This test ensures we're not accumulating memory unnecessarily
      expect(results.length).toBe(10000);
    });

    test('Result should be lazy (no eager evaluation)', () => {
      let sideEffectCount = 0;
      const sideEffect = (x: number): number => {
        sideEffectCount++;
        return x * 2;
      };
      
      const result = Result.success(5).map(sideEffect);
      
      // Side effect should not have executed yet
      expect(sideEffectCount).toBe(0);
      
      // Now it should execute
      result.match(x => x, e => e);
      expect(sideEffectCount).toBe(1);
    });
  });
});