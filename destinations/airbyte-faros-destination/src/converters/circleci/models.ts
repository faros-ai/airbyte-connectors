export interface CommitKey {
  readonly sha: string;
  readonly uid: string;
  readonly repository: {
    readonly name: string;
    readonly uid: string;
    readonly organization: {
      readonly uid: string;
      readonly source: string;
    };
  };
}

export interface BuildKey {
  readonly uid: string;
  readonly pipeline: PipelineKey;
}

interface PipelineKey {
  readonly uid: string;
  readonly organization: {
    readonly uid: string;
    readonly source: string;
  };
}
