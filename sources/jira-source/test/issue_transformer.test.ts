import {IssueTransformer} from '../src/issue_transformer';

describe('IssueTransformer', () => {
  describe('retrieveFieldValue', () => {
    let transformer: IssueTransformer;

    beforeEach(() => {
      transformer = new IssueTransformer(
        'https://jira.example.com',
        new Map(),
        new Map(),
        new Map(),
        [],
        10
      );
    });

    test('should return value when only value is present', () => {
      const result = transformer.retrieveFieldValue({value: 'test-value'});
      expect(result).toBe('test-value');
    });

    test('should return name when only name is present', () => {
      const result = transformer.retrieveFieldValue({name: 'test-name'});
      expect(result).toBe('test-name');
    });

    test('should return displayName when only displayName is present', () => {
      const result = transformer.retrieveFieldValue({
        displayName: 'test-display-name',
      });
      expect(result).toBe('test-display-name');
    });

    test('should handle cascading fields with parent and child values', () => {
      const result = transformer.retrieveFieldValue({
        value: 'Parent Value',
        child: {
          value: 'Child Value',
        },
      });
      expect(result).toBe('Parent Value - Child Value');
    });

    test('should handle cascading fields when child is null', () => {
      const result = transformer.retrieveFieldValue({
        value: 'Parent Value',
        child: null,
      });
      expect(result).toBe('Parent Value');
    });

    test('should handle cascading fields when child value is null', () => {
      const result = transformer.retrieveFieldValue({
        value: 'Parent Value',
        child: {
          value: null,
        },
      });
      expect(result).toBe('Parent Value');
    });

    test('should return undefined when no value, name, or displayName is present', () => {
      const result = transformer.retrieveFieldValue({});
      expect(result).toBeUndefined();
    });
  });
});
