export enum RunMode {
  Minimum = 'Minimum',
  Full = 'Full',
  Custom = 'Custom',
}

export const RunModeStreams: Record<RunMode, ReadonlyArray<string>> = {
  [RunMode.Minimum]: ['faros_projects', 'faros_changes'],
  [RunMode.Full]: [
    'faros_projects',
    'faros_changes',
    'faros_accounts',
    'faros_groups',
    'faros_group_members',
    'faros_branches',
    'faros_tags',
    'faros_revisions',
    'faros_reviews',
    'faros_comments',
  ],
  [RunMode.Custom]: [],
};
