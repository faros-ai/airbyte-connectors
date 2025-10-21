import {
  Artifact,
  artifactValidationSchema,
  Commit,
  commitValidationSchema,
  FarosPath,
  farosPathsValidationSchema,
  FarosTag,
  farosTagsValidationSchema,
  Run,
  runValidationSchema,
  stringValidationSchema,
  timestampValidationSchema,
  URI_CHARS,
} from './common';

export const ONE_OF_CD_OBJECT =
  "must have either property 'deploy', 'artifact', 'commit', or 'run'";

const ONE_OF_ARTIFACT_OR_COMMIT_ERROR_MESSAGE =
  "must have either property 'artifact' or 'commit'";

export const ONE_OF_URI_OR_DEPLOY_IDS_ERROR_MESSAGE =
  // eslint-disable-next-line max-len
  'information is incomplete. The data must contain either deploy.uri OR deploy.id, deploy.environment, deploy.application, deploy.source';

export interface Deploy {
  readonly uri?: string;
  readonly id?: string;
  readonly environment?: string;
  readonly environmentDetails?: string;
  readonly application?: string;
  readonly applicationPlatform?: string;
  readonly applicationTags?: FarosTag[] | string;
  readonly applicationPaths?: FarosPath[] | string;
  readonly requestedAt?: string | number;
  readonly url?: string;
  readonly source?: string;
  readonly status?: string;
  readonly statusDetails?: string;
  readonly startTime?: string | number;
  readonly endTime?: string | number;
  readonly tags?: FarosTag[] | string;
}

const deploymentSchemaDefinition = {
  uri: {
    type: 'string',
    pattern: `^${URI_CHARS}*://${URI_CHARS}*/${URI_CHARS}*/${URI_CHARS}*$`,
    maxLength: 1000,
  },
  id: stringValidationSchema,
  environment: stringValidationSchema,
  environmentDetails: stringValidationSchema,
  application: stringValidationSchema,
  applicationPlatform: stringValidationSchema,
  applicationTags: farosTagsValidationSchema,
  applicationPaths: farosPathsValidationSchema,
  requestedAt: timestampValidationSchema,
  url: stringValidationSchema,
  source: stringValidationSchema,
  status: stringValidationSchema,
  statusDetails: {type: 'string'}, // Truncated later
  startTime: timestampValidationSchema,
  endTime: timestampValidationSchema,
  tags: farosTagsValidationSchema,
};

export const deployValidationSchema = {
  type: 'object',
  properties: deploymentSchemaDefinition,
  oneOf: [
    {
      required: ['uri'],
      errorMessage: {
        required: ONE_OF_URI_OR_DEPLOY_IDS_ERROR_MESSAGE,
      },
    },
    {
      required: ['source', 'application', 'environment', 'id'],
      errorMessage: {
        required: ONE_OF_URI_OR_DEPLOY_IDS_ERROR_MESSAGE,
      },
    },
  ],
  errorMessage: {
    oneOf: ONE_OF_URI_OR_DEPLOY_IDS_ERROR_MESSAGE,
  },
  dependencies: {
    statusDetails: {required: ['status']},
  },
  additionalProperties: false,
};

export interface CDEvent {
  readonly deploy?: Deploy;
  readonly artifact?: Artifact;
  readonly commit?: Commit;
  readonly run?: Run;
}

export const cdFullValidationSchema = {
  type: 'object',
  properties: {
    deploy: {...deployValidationSchema, required: ['status']},
    artifact: artifactValidationSchema,
    commit: commitValidationSchema,
    run: {...runValidationSchema, required: ['status']},
  },
  required: ['deploy'],
  oneOf: [
    {
      required: ['artifact'],
      errorMessage: {
        required: ONE_OF_ARTIFACT_OR_COMMIT_ERROR_MESSAGE,
      },
    },
    {
      required: ['commit'],
      errorMessage: {
        required: ONE_OF_ARTIFACT_OR_COMMIT_ERROR_MESSAGE,
      },
    },
  ],
  errorMessage: {
    oneOf: ONE_OF_ARTIFACT_OR_COMMIT_ERROR_MESSAGE,
  },
  additionalProperties: false,
};

export const cdValidationSchema = {
  type: 'object',
  properties: {
    deploy: deployValidationSchema,
    artifact: artifactValidationSchema,
    commit: commitValidationSchema,
    run: runValidationSchema,
  },
  anyOf: [
    {required: ['deploy']},
    {required: ['artifact']},
    {required: ['commit']},
    {required: ['run']},
  ],
  errorMessage: {
    anyOf: ONE_OF_CD_OBJECT,
  },
  additionalProperties: false,
};
