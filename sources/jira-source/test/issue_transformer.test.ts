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

  describe('assigneeChangelog', () => {
    const created = new Date('2024-01-01T10:00:00.000Z');

    test('should handle issue with assignee at creation and no changes', () => {
      const result = IssueTransformer.assigneeChangelog([], 'user1', created);
      expect(result).toMatchSnapshot();
    });

    test('should handle issue created unassigned then assigned', () => {
      const changelog = [{
        created: '2024-01-02T10:00:00.000Z',
        items: [{
          field: 'assignee',
          fromString: null,
          toString: 'user1'
        }]
      }];

      const result = IssueTransformer.assigneeChangelog(changelog, 'user1', created);
      expect(result).toMatchSnapshot();
    });

    test('should handle multiple assignee changes', () => {
      const changelog = [
        {
          created: '2024-01-01T12:00:00.000Z',
          items: [{
            field: 'assignee',
            fromString: null,
            toString: 'user1'
          }]
        },
        {
          created: '2024-01-02T10:00:00.000Z',
          items: [{
            field: 'assignee',
            fromString: 'user1',
            toString: 'user2'
          }]
        },
        {
          created: '2024-01-03T10:00:00.000Z',
          items: [{
            field: 'assignee',
            fromString: 'user2',
            toString: 'user3'
          }]
        }
      ];

      const result = IssueTransformer.assigneeChangelog(changelog, 'user3', created);
      expect(result).toMatchSnapshot();
    });

    test('should handle issue assigned at creation then changed', () => {
      const changelog = [{
        created: '2024-01-02T10:00:00.000Z',
        items: [{
          field: 'assignee',
          fromString: 'user1',
          toString: 'user2'
        }]
      }];

      const result = IssueTransformer.assigneeChangelog(changelog, 'user2', created);
      expect(result).toMatchSnapshot();
    });

    test('should handle assignee being unassigned', () => {
      const changelog = [
        {
          created: '2024-01-01T12:00:00.000Z',
          items: [{
            field: 'assignee',
            fromString: null,
            toString: 'user1'
          }]
        },
        {
          created: '2024-01-02T10:00:00.000Z',
          items: [{
            field: 'assignee',
            fromString: 'user1',
            toString: null
          }]
        }
      ];

      const result = IssueTransformer.assigneeChangelog(changelog, null, created);
      expect(result).toMatchSnapshot();
    });

    test('should handle issue with no assignee history', () => {
      const result = IssueTransformer.assigneeChangelog([], null, created);
      expect(result).toMatchSnapshot();
    });
  });
});
