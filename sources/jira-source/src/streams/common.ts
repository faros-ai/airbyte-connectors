export type StreamSlice = {
  project: string;
};

export type StreamState = {
  readonly [project: string]: ProjectState;
};

export interface ProjectState {
  readonly issueCutoff?: number;
}
