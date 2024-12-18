import {SyncMessage} from './protocol';

// TODO: more entries
export const SYNC_MESSAGE_TABLE = {
  FEATURE_NOT_ENABLED: (
    featureName: string,
    sourceType: string
  ): SyncMessage => ({
    code: 1000,
    summary: `${featureName} not enabled`,
    details: `It seems this functionality, ${featureName}, is not enabled for the ${sourceType} source.`,
    action: 'Contact support to enable this feature',
    type: 'ERROR',
  }),
  CONNECTION_UNAVAILABLE: (sourceType: string): SyncMessage => ({
    code: 1001,
    summary: 'Connection unavailable',
    details: `Unable to establish a connection with your ${sourceType} source.`,
    action:
      'Check if your source is configured to accept requests from our system.',
    type: 'ERROR',
  }),
  INVALID_CREDENTIALS: (sourceType: string): SyncMessage => ({
    code: 1002,
    summary: 'Invalid credentials',
    details: `We are unable to retrieve data from your ${sourceType} source.`,
    action: `Check your ${sourceType} credentials. Ensure they are correct and up-to-date.`,
    type: 'ERROR',
  }),
  NO_RECORDS_FOR_STREAM: (
    streamName: string,
    sourceType: string
  ): SyncMessage => ({
    code: 1003,
    summary: `No records emitted for ${streamName} stream`,
    entity: streamName,
    action: `Check your ${sourceType} credentials. Ensure they have the required permissions.`,
    type: 'WARNING',
  }),
};
