import {BoardIssueTracker} from '../src/streams/board_issue_tracker';

describe('board issue tracker', () => {
  test('no state', () => {
    const tracker = new BoardIssueTracker(undefined, 'b1');
    expect(tracker.isNewIssue({key: 't1'})).toBeTruthy();
    expect(tracker.isNewIssue({key: 't2'})).toBeTruthy();
    expect(tracker.deletedIssues()).toHaveLength(0);
    expect(tracker.getState()).toEqual({
      boardIssues: {
        b1: ['t1', 't2'],
      },
    });
  });
  test('with initial state', () => {
    const tracker = new BoardIssueTracker(
      {
        boardIssues: {
          b1: ['t1', 't2'],
          b2: ['t1', 't3'],
        },
      },
      'b2'
    );
    expect(tracker.isNewIssue({key: 't1'})).toBeFalsy();
    expect(tracker.isNewIssue({key: 't2'})).toBeTruthy();
    expect(tracker.deletedIssues()).toEqual([
      {key: 't3', boardId: 'b2', isDeleted: true},
    ]);
    expect(tracker.getState()).toEqual({
      boardIssues: {
        b1: ['t1', 't2'],
        b2: ['t1', 't2'],
      },
    });
  });
  test('with no initial state for board', () => {
    const tracker = new BoardIssueTracker(
      {
        boardIssues: {
          b1: ['t1', 't2'],
        },
      },
      'b2'
    );
    expect(tracker.isNewIssue({key: 't1'})).toBeTruthy();
    expect(tracker.isNewIssue({key: 't2'})).toBeTruthy();
    expect(tracker.deletedIssues()).toHaveLength(0);
    expect(tracker.getState()).toEqual({
      boardIssues: {
        b1: ['t1', 't2'],
        b2: ['t1', 't2'],
      },
    });
  });
});
