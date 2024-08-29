interface CalculatedActivity {
  commitCount: number;
  mergedAt: string;
}

export interface Branch {
  readonly name: string;
  readonly links: {readonly htmlUrl: string};
  readonly defaultMergeStrategy: string;
  readonly mergeStrategies: string[];
  readonly type: string;
  readonly target: {
    readonly hash: string;
    repository: {
      readonly links: {readonly htmlUrl: string};
      readonly type: string;
      readonly name: string;
      fullName: string;
      readonly uuid: string;
    };
    readonly links: {readonly htmlUrl: string};
    readonly author: {
      readonly raw: string;
      readonly type: string;
      readonly user: {
        readonly displayName: string;
        readonly uuid: string;
        readonly links: {readonly htmlUrl: string};
        readonly type: string;
        readonly nickname: string;
        readonly accountId: string;
      };
    };
    readonly parents: {
      readonly hash: string;
      readonly links: {readonly htmlUrl: string};
    }[];
    readonly date: string;
    readonly message: string;
    readonly type: string;
  };
}

export interface Commit {
  readonly hash: string;
  readonly date: string;
  readonly message: string;
  readonly type: string;
  readonly rendered: {
    readonly message: {
      readonly raw: string;
      readonly markup: string;
      readonly html: string;
      readonly type: string;
    };
  };
  readonly repository: {
    readonly type: string;
    readonly name: string;
    readonly fullName: string;
    readonly uuid: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly links: {
    readonly commentsUrl: string;
    readonly htmlUrl: string;
    readonly diffUrl: string;
    readonly approveUrl: string;
    readonly statusesUrl: string;
  };
  readonly author: {
    readonly raw: string;
    readonly type: string;
    readonly user?: {
      readonly displayName: string;
      readonly uuid: string;
      readonly type: string;
      readonly nickname: string;
      readonly accountId: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
  };
  readonly summary: {
    readonly raw: string;
    readonly markup: string;
    readonly html: string;
    readonly type: string;
  };
  parents: {
    readonly hash: string;
    readonly type: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  }[];
}

export interface Deployment {
  readonly type: string;
  readonly uuid: string;
  readonly name?: string;
  readonly key: string;
  readonly version: number;
  readonly lastUpdateTime?: string;
  readonly environment: {
    readonly uuid: string;
    readonly name?: string;
    readonly slug?: string;
    readonly rank?: number;
    readonly type?: string;
  };
  readonly fullEnvironment?: Environment;
  readonly step: {
    readonly uuid: string;
    readonly type: string;
  };
  readonly commit: {
    readonly type: string;
    readonly hash: string;
    readonly links: {readonly htmlUrl: string};
  };
  readonly state: DeploymentsState;
  readonly deployable: {
    readonly type: string;
    readonly uuid: string;
    readonly key: string;
    readonly name: string;
    readonly url: string;
    readonly createdOn: string;
    readonly pipeline: {
      readonly uuid: string;
      readonly type: string;
    };
    readonly commit: {
      readonly type: string;
      readonly hash: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
  };
  readonly release: {
    readonly type: string;
    readonly uuid: string;
    readonly key: string;
    readonly name: string;
    readonly url: string;
    readonly createdOnn: string;
    readonly pipeline: {
      readonly uuid: string;
      readonly type: string;
    };
    readonly commit: {
      readonly type: string;
      readonly hash: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
  };
}

export interface DeploymentsState {
  readonly type: string;
  readonly name: string;
  readonly url: string;
  readonly startedOn: string;
  readonly completedOn: string;
  readonly status?: {readonly type: string; readonly name: string};
}

export interface DiffStat {
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly filesChanged: number;
}

export interface Environment {
  readonly name: string;
  readonly environmentLockEnabled: boolean;
  readonly deploymentGateEnabled: boolean;
  readonly rank: number;
  readonly hidden: boolean;
  readonly type: string;
  readonly slug: string;
  readonly uuid: string;
  readonly category: {
    readonly name: string;
  };
  readonly restrictions: {
    readonly adminOnly: boolean;
    readonly type: string;
  };
  readonly lock: {
    readonly type: string;
    readonly name: string;
  };
  readonly environmentType: {
    readonly type: string;
    readonly name: string;
    readonly rank: number;
  };
}

export interface Issue {
  readonly priority: string;
  readonly kind: string;
  readonly title: string;
  readonly state: string;
  readonly createdOn: string;
  readonly updatedOn: string;
  readonly type: string;
  readonly votes: number;
  readonly watches: number;
  readonly id: number;
  readonly component: any;
  readonly version: any;
  readonly editedOn: any;
  readonly milestone: any;
  readonly repository: {
    readonly type: string;
    readonly name: string;
    readonly fullName: string;
    readonly uuid: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly links: {
    readonly attachmentsUrl: string;
    readonly watchUrl: string;
    readonly commentsUrl: string;
    readonly htmlUrl: string;
    readonly voteUrl: string;
  };
  readonly reporter: {
    readonly displayName: string;
    readonly uuid: string;
    readonly type: string;
    readonly nickname: string;
    readonly accountId: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly content: {
    readonly raw: string;
    readonly markup: string;
    readonly html: string;
    readonly type: string;
  };
  assignee: User;
}

export interface User {
  readonly displayName: string;
  readonly emailAddress?: string;
  readonly uuid: string;
  readonly type: string;
  readonly nickname: string;
  readonly accountId: string;
  readonly links: {
    readonly htmlUrl: string;
  };
}

export interface Pipeline {
  readonly type: string;
  readonly uuid: string;
  readonly buildNumber: number;
  readonly createdOn: string;
  readonly completedOn?: string;
  readonly runNumber: number;
  readonly durationInSeconds: number;
  readonly buildSecondsUsed: number;
  readonly firstSuccessful: boolean;
  readonly expired: boolean;
  readonly hasVariables: boolean;
  readonly repository: {
    readonly name: string;
    readonly type: string;
    readonly fullName: string;
    readonly uuid: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly state: PipelineState;
  readonly creator: {
    readonly displayName: string;
    readonly accountId: string;
    readonly nickname: string;
    readonly type: string;
    readonly uuid: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly target: {
    readonly type: string;
    readonly refType: string;
    readonly refName: string;
    readonly selector: {
      readonly type: string;
    };
    readonly commit?: {
      readonly type: string;
      readonly hash: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
  };
  readonly trigger: {
    readonly name: string;
    readonly type: string;
  };
  readonly links: {
    readonly htmlUrl: string;
  };
}

export interface PipelineState {
  readonly name: string;
  readonly type: string;
  readonly stage?: {
    readonly name: string;
    readonly type: string;
  };
}

export interface PipelineStep {
  readonly uuid: string;
  readonly startedOn: string;
  readonly completedOn?: string;
  readonly type: string;
  readonly name: string;
  readonly runNumber: number;
  readonly maxTime: number;
  readonly buildSecondsUsed: number;
  readonly durationInSeconds: number;
  readonly pipeline: {
    readonly type: string;
    readonly uuid: string;
  };
  readonly image: {
    readonly name: string;
  };
  readonly scriptCommands: {
    readonly commandType: string;
    readonly command: string;
    readonly name: string;
  }[];
  readonly state: PipelineStepState;
  readonly trigger: {
    readonly type: string;
  };
  readonly teardownCommands: {
    readonly commandType: string;
    readonly action: string;
    readonly command: string;
    readonly name: string;
  }[];
  readonly setupCommands: {
    readonly commandType: string;
    readonly command: string;
    readonly name: string;
  }[];
}

export interface PipelineStepState {
  readonly type: string;
  readonly name: string;
  readonly result: {
    readonly type: string;
    readonly name: string;
  };
}

export interface PullRequest {
  readonly description: string;
  readonly title: string;
  readonly type: string;
  readonly createdOn: string;
  readonly state: string;
  readonly reason: string;
  readonly updatedOn: string;
  readonly closeSourceBranch: boolean;
  readonly id: number;
  readonly commentCount: number;
  readonly taskCount: number;
  readonly diffStat?: DiffStat;
  readonly calculatedActivity?: CalculatedActivity;
  readonly links: {
    readonly declineUrl: string;
    readonly diffstatUrl: string;
    readonly commitsUrl: string;
    readonly commentsUrl: string;
    readonly mergeUrl: string;
    readonly htmlUrl: string;
    readonly activityUrl: string;
    readonly diffUrl: string;
    readonly approveUrl: string;
    readonly statusesUrl: string;
  };
  readonly destination: {
    readonly commit: {
      readonly hash: string;
      readonly type: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
    repository: {
      readonly type: string;
      readonly name: string;
      readonly fullName: string;
      readonly uuid: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
    readonly branch: {
      readonly name: string;
    };
  };
  readonly summary: {
    readonly raw: string;
    readonly markup: string;
    readonly html: string;
    readonly type: string;
  };
  readonly source: {
    readonly commit: {
      readonly hash: string;
      readonly type: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
    readonly repository: {
      readonly links: {
        readonly htmlUrl: string;
      };
      readonly type: string;
      readonly name: string;
      readonly fullName: string;
      readonly uuid: string;
    };
    readonly branch: {
      readonly name: string;
    };
  };
  readonly author: User;
  readonly mergeCommit: null | {
    readonly hash: string;
    readonly type: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly closedBy: null | User;
}

export interface PRActivity {
  readonly changes_requested?: any;
  readonly approval?: {
    readonly date: string;
    readonly pullrequest: {
      readonly type: string;
      readonly id: number;
      readonly title: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
    readonly user: {
      readonly display_name: string;
      readonly uuid: string;
      readonly type: string;
      readonly nickname: string;
      readonly account_id: string;
      readonly links: {
        readonly htmlUrl: string;
      };
    };
  };
  readonly update?: {
    readonly description: string;
    readonly title: string;
    readonly state: string;
    readonly reason: string;
    readonly date: string;
    readonly reviewers: any[];
    readonly destination: {
      readonly commit: {
        readonly hash: string;
        readonly type: string;
        readonly links: {
          readonly htmlUrl: string;
        };
      };
      readonly repository: {
        readonly type: string;
        readonly name: string;
        readonly fullName: string;
        readonly uuid: string;
        readonly links: {
          readonly htmlUrl: string;
        };
      };
      readonly branch: {
        readonly name: string;
      };
    };
    readonly source: {
      readonly commit: {
        readonly hash: string;
        readonly type: string;
        readonly links: {
          readonly htmlUrl: string;
        };
      };
      readonly repository: {
        readonly type: string;
        readonly name: string;
        readonly fullName: string;
        readonly uuid: string;
        readonly links: {
          readonly htmlUrl: string;
        };
      };
      readonly branch: {
        readonly name: string;
      };
    };
    readonly author: User;
    readonly changes: {
      readonly status?: {
        readonly new: string;
        readonly old: string;
      };
    };
  };
  readonly pullRequest: {
    readonly type: string;
    readonly title: string;
    readonly id: number;
    readonly repositorySlug?: string;
    readonly workspace?: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly comment?: {
    readonly deleted: boolean;
    readonly created_on: string;
    readonly updated_on: string;
    readonly type: string;
    readonly id: number;
    readonly links: {
      readonly htmlUrl: string;
    };
    readonly content: {
      readonly raw: string;
      readonly markup: string;
      readonly html: string;
      readonly type: string;
    };
    readonly user: User;
  };
}

export interface PRDiffStat {
  readonly status: string;
  readonly old: any;
  readonly linesRemoved: number;
  readonly linesAdded: number;
  readonly type: string;
  readonly new: {
    readonly path: string;
    readonly escapedPath: string;
    readonly type: string;
  };
}

export interface Repository {
  workspace: string;
  slug: string;
  fullName: string;
  description: string;
  isPrivate: boolean;
  language: string;
  size: number;
  htmlUrl: string;
  createdOn: string;
  updatedOn: string;
  mainBranch: string;
  hasIssues: boolean;
}

export interface WorkspaceUser {
  readonly type: string;
  readonly user: User;
  readonly workspace: {
    readonly slug: string;
    readonly type: string;
    readonly name: string;
    readonly uuid: string;
    readonly links: {
      readonly htmlUrl: string;
    };
  };
  readonly links: {
    readonly htmlUrl: string;
  };
}

export interface Workspace {
  readonly uuid: string;
  readonly createdOn: string;
  readonly type: string;
  readonly slug: string;
  readonly isPrivate: boolean;
  readonly name: string;
  readonly links: {
    readonly ownersUrl: string;
    readonly repositoriesUrl: string;
    readonly htmlUrl: string;
  };
}
