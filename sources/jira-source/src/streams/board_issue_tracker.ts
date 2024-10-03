import {IssueCompact} from 'faros-airbyte-common/lib/jira';

type BoardIssues = Record<string, string[]>;

export interface BoardIssueTrackerState {
  boardIssues: BoardIssues;
}

export class BoardIssueTracker {
  private readonly seenIssues: Set<string> = new Set();
  private readonly existingIssues: Set<string> = new Set();

  constructor(
    private readonly state: BoardIssueTrackerState | undefined,
    private readonly boardId: string
  ) {
    if (Array.isArray(state?.boardIssues?.[boardId])) {
      state.boardIssues[boardId].forEach((issue) => {
        this.existingIssues.add(issue);
      });
    }
  }

  /**
   * Returns true if the issue has not been seen before.
   * Adds this issue to set of seen issues for state tracking.
   * @param issue
   */
  isNewIssue(issue: IssueCompact): boolean {
    this.seenIssues.add(issue.key);
    return !this.existingIssues.has(issue.key);
  }

  /**
   * Returns issues from prior state that are no longer present.
   * The returned records contain special `isDeleted: true` property.
   * The converter will use this to create Deletion records.
   */
  deletedIssues(): IssueCompact[] {
    return Array.from(this.existingIssues)
      .filter((key) => !this.seenIssues.has(key))
      .map((key) => {
        return {key, boardId: this.boardId, isDeleted: true};
      });
  }

  /**
   * Returns the current state of the board issues.
   * This is an aggregation of initial state used
   * to create this tracker and the present issues in
   * the current board.
   */
  getState(): BoardIssueTrackerState {
    return {
      boardIssues: {
        ...this.state?.boardIssues,
        [this.boardId]: Array.from(this.seenIssues.values()),
      },
    };
  }
}
