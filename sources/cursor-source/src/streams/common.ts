export enum RunMode {
  Full = 'Full',
  Custom = 'Custom',
}

export const DEFAULT_RUN_MODE = RunMode.Full;

// Stream names for Full mode - all available streams
export const FullStreamNames = [
  'members',
  'daily_usage',
  'usage_events',
  'ai_commit_metrics',
];

// Stream names for Custom mode - all available streams
export const CustomStreamNames = [
  'members',
  'daily_usage',
  'usage_events',
  'ai_commit_metrics',
];

// Mapping of run modes to their corresponding stream lists
export const RunModeStreams: {
  [key in RunMode]: string[];
} = {
  [RunMode.Full]: FullStreamNames,
  [RunMode.Custom]: CustomStreamNames,
};
