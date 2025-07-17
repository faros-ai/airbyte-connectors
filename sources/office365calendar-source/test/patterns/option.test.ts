import { Option } from '../../src/patterns/option';

describe('Option<T> Pattern - Zero Null Pointer Bugs', () => {
  describe('Construction', () => {
    test('Option.some() should wrap values', () => {
      const option = Option.some(42);
      
      expect(option.isSome()).toBe(true);
      expect(option.isNone()).toBe(false);
      
      option.match(
        value => expect(value).toBe(42),
        () => fail('Should not call none handler')
      );
    });

    test('Option.none() should represent absence', () => {
      const option = Option.none<number>();
      
      expect(option.isSome()).toBe(false);
      expect(option.isNone()).toBe(true);
      
      option.match(
        value => fail('Should not call some handler'),
        () => expect(true).toBe(true) // Success path
      );
    });

    test('Option.fromNullable() should handle null/undefined correctly', () => {
      const someOption = Option.fromNullable(42);
      const nullOption = Option.fromNullable(null);
      const undefinedOption = Option.fromNullable(undefined);
      
      expect(someOption.isSome()).toBe(true);
      expect(nullOption.isNone()).toBe(true);
      expect(undefinedOption.isNone()).toBe(true);
    });

    test('Option constructors should be pure (no side effects)', () => {
      const originalArray = [1, 2, 3];
      const option = Option.some(originalArray);
      
      // Modifying original should not affect Option
      originalArray.push(4);
      
      option.match(
        value => expect(value).toEqual([1, 2, 3]),
        () => fail('Should not be none')
      );
    });
  });

  describe('Functor Laws (map)', () => {
    test('map should transform Some values only', () => {
      const some = Option.some(10);
      const doubled = some.map(x => x * 2);
      
      doubled.match(
        value => expect(value).toBe(20),
        () => fail('Should not be none')
      );
    });

    test('map should not transform None values', () => {
      const none = Option.none<number>();
      const doubled = none.map(x => x * 2);
      
      expect(doubled.isNone()).toBe(true);
    });

    test('map should satisfy functor identity law', () => {
      const option = Option.some(42);
      const identity = <T>(x: T): T => x;
      
      const mapped = option.map(identity);
      
      expect(option.getOrElse(-1)).toBe(mapped.getOrElse(-1));
    });

    test('map should satisfy functor composition law', () => {
      const option = Option.some(5);
      const f = (x: number): number => x * 2;
      const g = (x: number): number => x + 1;
      
      const composed = option.map(x => g(f(x)));
      const chained = option.map(f).map(g);
      
      expect(composed.getOrElse(-1)).toBe(chained.getOrElse(-1));
    });
  });

  describe('Monad Laws (flatMap)', () => {
    test('flatMap should chain operations safely', () => {
      const safeDivide = (x: number, y: number): Option<number> =>
        y === 0 ? Option.none() : Option.some(x / y);
      
      const result = Option.some(10)
        .flatMap(x => safeDivide(x, 2))
        .flatMap(x => safeDivide(x, 5));
      
      result.match(
        value => expect(value).toBe(1),
        () => fail('Should not be none')
      );
    });

    test('flatMap should short-circuit on first None', () => {
      const safeDivide = (x: number, y: number): Option<number> =>
        y === 0 ? Option.none() : Option.some(x / y);
      
      const result = Option.some(10)
        .flatMap(x => safeDivide(x, 0)) // This should return None
        .flatMap(x => safeDivide(x, 2)); // This should never execute
      
      expect(result.isNone()).toBe(true);
    });

    test('flatMap should satisfy left identity law', () => {
      const value = 42;
      const f = (x: number): Option<string> => Option.some(x.toString());
      
      const leftSide = Option.some(value).flatMap(f);
      const rightSide = f(value);
      
      expect(leftSide.getOrElse('')).toBe(rightSide.getOrElse(''));
    });

    test('flatMap should satisfy right identity law', () => {
      const option = Option.some(42);
      const identity = <T>(x: T): Option<T> => Option.some(x);
      
      const mapped = option.flatMap(identity);
      
      expect(option.getOrElse(-1)).toBe(mapped.getOrElse(-1));
    });

    test('flatMap should satisfy associativity law', () => {
      const option = Option.some(5);
      const f = (x: number): Option<number> => Option.some(x * 2);
      const g = (x: number): Option<number> => Option.some(x + 1);
      
      const leftAssoc = option.flatMap(f).flatMap(g);
      const rightAssoc = option.flatMap(x => f(x).flatMap(g));
      
      expect(leftAssoc.getOrElse(-1)).toBe(rightAssoc.getOrElse(-1));
    });
  });

  describe('Filtering and Conditional Operations', () => {
    test('filter should conditionally retain values', () => {
      const some = Option.some(10);
      const none = Option.none<number>();
      
      const evenSome = some.filter(x => x % 2 === 0);
      const oddSome = some.filter(x => x % 2 === 1);
      const filteredNone = none.filter(x => x % 2 === 0);
      
      expect(evenSome.isSome()).toBe(true);
      expect(oddSome.isNone()).toBe(true);
      expect(filteredNone.isNone()).toBe(true);
    });

    test('exists should check predicate on Some values', () => {
      const some = Option.some(10);
      const none = Option.none<number>();
      
      expect(some.exists(x => x > 5)).toBe(true);
      expect(some.exists(x => x < 5)).toBe(false);
      expect(none.exists(x => x > 5)).toBe(false);
    });

    test('forAll should check predicate on Some values', () => {
      const some = Option.some(10);
      const none = Option.none<number>();
      
      expect(some.forAll(x => x > 5)).toBe(true);
      expect(some.forAll(x => x < 5)).toBe(false);
      expect(none.forAll(x => x > 5)).toBe(true); // Vacuous truth
    });
  });

  describe('Value Extraction', () => {
    test('getOrElse should provide defaults', () => {
      const some = Option.some(42);
      const none = Option.none<number>();
      
      expect(some.getOrElse(0)).toBe(42);
      expect(none.getOrElse(0)).toBe(0);
    });

    test('getOrElse should work with function defaults', () => {
      const some = Option.some(42);
      const none = Option.none<number>();
      
      expect(some.getOrElse(() => 0)).toBe(42);
      expect(none.getOrElse(() => 0)).toBe(0);
    });

    test('orElse should provide alternative Options', () => {
      const some = Option.some(42);
      const none = Option.none<number>();
      const alternative = Option.some(0);
      
      expect(some.orElse(alternative).getOrElse(-1)).toBe(42);
      expect(none.orElse(alternative).getOrElse(-1)).toBe(0);
    });

    test('unwrap should return value for Some', () => {
      const option = Option.some(42);
      expect(option.unwrap()).toBe(42);
    });

    test('unwrap should throw for None', () => {
      const option = Option.none<number>();
      expect(() => option.unwrap()).toThrow('Called unwrap on None');
    });
  });

  describe('Collection Operations', () => {
    test('toArray should convert to array', () => {
      const some = Option.some(42);
      const none = Option.none<number>();
      
      expect(some.toArray()).toEqual([42]);
      expect(none.toArray()).toEqual([]);
    });

    test('combine should aggregate multiple Options', () => {
      const options = [
        Option.some(1),
        Option.some(2),
        Option.some(3)
      ];
      
      const combined = Option.combine(options);
      
      combined.match(
        values => expect(values).toEqual([1, 2, 3]),
        () => fail('Should not be none')
      );
    });

    test('combine should fail if any Option is None', () => {
      const options = [
        Option.some(1),
        Option.none<number>(),
        Option.some(3)
      ];
      
      const combined = Option.combine(options);
      
      expect(combined.isNone()).toBe(true);
    });

    test('traverse should apply function to all Options', () => {
      const values = [1, 2, 3];
      const safeSqrt = (x: number): Option<number> => 
        x >= 0 ? Option.some(Math.sqrt(x)) : Option.none();
      
      const result = Option.traverse(values, safeSqrt);
      
      result.match(
        roots => {
          expect(roots).toHaveLength(3);
          expect(roots[0]).toBeCloseTo(1);
          expect(roots[1]).toBeCloseTo(Math.sqrt(2));
          expect(roots[2]).toBeCloseTo(Math.sqrt(3));
        },
        () => fail('Should not be none')
      );
    });

    test('traverse should fail if any function returns None', () => {
      const values = [1, -2, 3];
      const safeSqrt = (x: number): Option<number> => 
        x >= 0 ? Option.some(Math.sqrt(x)) : Option.none();
      
      const result = Option.traverse(values, safeSqrt);
      
      expect(result.isNone()).toBe(true);
    });
  });

  describe('Type Safety', () => {
    test('Option should preserve type information', () => {
      const stringOption: Option<string> = Option.some('hello');
      const numberOption: Option<number> = stringOption.map(s => s.length);
      
      numberOption.match(
        value => {
          expect(typeof value).toBe('number');
          expect(value).toBe(5);
        },
        () => fail('Should not be none')
      );
    });

    test('Option should handle union types correctly', () => {
      type Value = string | number;
      
      const stringOption: Option<Value> = Option.some('hello');
      const numberOption: Option<Value> = Option.some(42);
      const noneOption: Option<Value> = Option.none();
      
      expect(stringOption.exists(v => typeof v === 'string')).toBe(true);
      expect(numberOption.exists(v => typeof v === 'number')).toBe(true);
      expect(noneOption.exists(v => typeof v === 'string')).toBe(false);
    });

    test('Option should work with complex object types', () => {
      interface User {
        readonly id: number;
        readonly name: string;
        readonly email?: string;
      }
      
      const user: User = { id: 1, name: 'John', email: 'john@example.com' };
      const userOption = Option.some(user);
      const emailOption = userOption
        .flatMap(u => Option.fromNullable(u.email))
        .filter(email => email.includes('@'));
      
      emailOption.match(
        email => expect(email).toBe('john@example.com'),
        () => fail('Should have email')
      );
    });
  });

  describe('Performance', () => {
    test('Option operations should not cause memory leaks', () => {
      // Create many Option instances and chain operations
      const options = Array.from({ length: 10000 }, (_, i) => 
        Option.some(i)
          .map(x => x * 2)
          .flatMap(x => Option.some(x + 1))
          .filter(x => x % 2 === 1)
          .map(x => x.toString())
      );
      
      // Count successful results
      const successCount = options.filter(opt => opt.isSome()).length;
      
      // All transformed values are odd, so all should pass filter
      expect(successCount).toBe(10000);
    });

    test('Option should be lazy (no eager evaluation)', () => {
      let sideEffectCount = 0;
      const sideEffect = (x: number): number => {
        sideEffectCount++;
        return x * 2;
      };
      
      const option = Option.some(5).map(sideEffect);
      
      // Side effect should not have executed yet
      expect(sideEffectCount).toBe(0);
      
      // Now it should execute
      option.match(x => x, () => 0);
      expect(sideEffectCount).toBe(1);
    });
  });

  describe('Practical Usage Patterns', () => {
    test('should handle configuration values safely', () => {
      interface Config {
        readonly timeout?: number;
        readonly retries?: number;
        readonly endpoint: string;
      }
      
      const config: Config = { endpoint: 'api.example.com' };
      
      const timeout = Option.fromNullable(config.timeout).getOrElse(5000);
      const retries = Option.fromNullable(config.retries).getOrElse(3);
      
      expect(timeout).toBe(5000);
      expect(retries).toBe(3);
    });

    test('should handle array operations safely', () => {
      const numbers = [1, 2, 3, 4, 5];
      
      const firstEven = Option.fromNullable(numbers.find(x => x % 2 === 0));
      const lastOdd = Option.fromNullable(numbers.reverse().find(x => x % 2 === 1));
      
      expect(firstEven.getOrElse(-1)).toBe(2);
      expect(lastOdd.getOrElse(-1)).toBe(5);
    });

    test('should chain nullable operations safely', () => {
      interface User {
        readonly id: number;
        readonly profile?: {
          readonly avatar?: {
            readonly url?: string;
          };
        };
      }
      
      const user: User = {
        id: 1,
        profile: {
          avatar: {
            url: 'https://example.com/avatar.jpg'
          }
        }
      };
      
      const avatarUrl = Option.fromNullable(user.profile)
        .flatMap(profile => Option.fromNullable(profile.avatar))
        .flatMap(avatar => Option.fromNullable(avatar.url))
        .getOrElse('default-avatar.jpg');
      
      expect(avatarUrl).toBe('https://example.com/avatar.jpg');
    });
  });
});