export const ONE_OF_URI_OR_ARTIFACT_IDS_ERROR_MESSAGE =
  // eslint-disable-next-line max-len
  'information is incomplete. The data must contain either artifact.uri OR artifact.id, artifact.repository, artifact.organization, artifact.source.';

export const ONE_OF_URI_OR_COMMIT_IDS_ERROR_MESSAGE =
  // eslint-disable-next-line max-len
  'information is incomplete. The data must contain either commit.uri OR commit.sha, commit.repository, commit.organization, commit.source';

export const ONE_OF_URI_OR_RUN_IDS_ERROR_MESSAGE =
  // eslint-disable-next-line max-len
  'information is incomplete. The data must contain either run.uri OR run.id, run.pipeline, run.organization, run.source';

export const INVALID_DATE_ERROR_MESSAGE =
  // eslint-disable-next-line max-len
  "must be a string representing a valid ISO-8601 date, a number or string representing milliseconds since epoch, or 'Now'";

export const INVALID_PULL_REQUEST_NUMBER_ERROR_MESSAGE =
  'must be a number or string representing a number';

const STRING_MAX_LENGTH = 1000;
// Allowed URI characters
export const URI_CHARS = '[a-zA-Z0-9._+-]';
// eslint-disable-next-line max-len, no-useless-escape
const uriPattern = `^${URI_CHARS}*://${URI_CHARS}*/${URI_CHARS}*/${URI_CHARS}*$`;
const numberPattern = '^[0-9]+$';
const commaArrayPattern = '^[0-9a-zA-Z=_-]+(,[0-9a-zA-Z=_-]+)*$';

export const stringValidationSchema = {
  type: 'string',
  maxLength: STRING_MAX_LENGTH,
};

export const uriValidationSchema = {
  type: 'string',
  pattern: uriPattern,
  maxLength: STRING_MAX_LENGTH,
};

export const integerValidationSchema = {
  type: 'integer',
};

export const timestampValidationSchema = {
  oneOf: [
    {
      type: 'string',
      format: 'date-time',
    },
    {
      type: 'string',
      pattern: '^Now$',
    },
    {
      type: 'string',
      pattern: numberPattern,
      maxLength: STRING_MAX_LENGTH,
    },
    {
      type: 'number',
    },
  ],
  errorMessage: {
    oneOf: INVALID_DATE_ERROR_MESSAGE,
  },
};

export interface FarosTag {
  readonly key: string;
  readonly value: string;
}

export const farosTagsValidationSchema = {
  oneOf: [
    {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: stringValidationSchema,
          value: stringValidationSchema,
        },
        required: ['key', 'value'],
      },
      maxItems: 100,
    },
    {
      type: 'string',
      pattern: '^[^:]+:[^,]+(,[^:]+:[^,]+)*$',
      maxLength: STRING_MAX_LENGTH,
    },
  ],
};

export interface FarosPath {
  readonly path: string;
}

export const farosPathsValidationSchema = {
  oneOf: [
    {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: stringValidationSchema,
        },
        required: ['path'],
      },
      maxItems: 100,
    },
    {
      type: 'string',
      pattern: '^[^,]+(,[^,]+)*$',
      maxLength: STRING_MAX_LENGTH,
    },
  ],
};

export interface FarosMetric {
  readonly id: string;
  readonly value: string;
  readonly type?: string;
  readonly typeDetails?: string;
}

const farosMetricsValidationSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: stringValidationSchema,
      value: stringValidationSchema,
      type: stringValidationSchema,
      typeDetails: {type: 'string'}, // Truncated later
    },
    required: ['id', 'value'],
  },
  maxItems: 100,
};

export interface ComputeInstance {
  readonly id: string;
  readonly name?: string;
  readonly createTime?: string | number;
  readonly os?: string;
  readonly osDetails?: string;
  readonly tags?: FarosTag[] | string;
  readonly source: string;
}

const computeInstanceSchemaDefinition = {
  id: stringValidationSchema,
  name: stringValidationSchema,
  createTime: timestampValidationSchema,
  os: stringValidationSchema,
  osDetails: stringValidationSchema,
  tags: farosTagsValidationSchema,
  source: stringValidationSchema,
};

const computeInstanceValidationSchema = {
  type: 'object',
  properties: computeInstanceSchemaDefinition,
  required: ['id', 'source'],
  dependencies: {osDetails: {required: ['os']}},
  additionalProperties: false,
};

export interface Agent {
  readonly id: string;
  readonly name?: string;
  readonly createTime?: string | number;
  readonly tags?: FarosTag[] | string;
  readonly host?: ComputeInstance;
  readonly source: string;
}

const agentSchemaDefinition = {
  id: stringValidationSchema,
  name: stringValidationSchema,
  createTime: timestampValidationSchema,
  tags: farosTagsValidationSchema,
  host: computeInstanceValidationSchema,
  source: stringValidationSchema,
};

const agentValidationSchema = {
  type: 'object',
  properties: agentSchemaDefinition,
  required: ['id', 'source'],
  additionalProperties: false,
};

export interface RunStep {
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly typeDetails?: string;
  readonly status?: string;
  readonly statusDetails?: string;
  readonly command?: string;
  readonly url?: string;
  readonly createTime?: string | number;
  readonly startTime?: string | number;
  readonly endTime?: string | number;
  readonly tags?: FarosTag[] | string;
  readonly metrics?: FarosMetric[];
  readonly agent?: Agent;
}

const runStepSchemaDefinition = {
  id: stringValidationSchema,
  name: stringValidationSchema,
  type: stringValidationSchema,
  typeDetails: {type: 'string'}, // Truncated later
  status: stringValidationSchema,
  statusDetails: {type: 'string'}, // Truncated later
  command: stringValidationSchema,
  url: stringValidationSchema,
  createTime: timestampValidationSchema,
  startTime: timestampValidationSchema,
  endTime: timestampValidationSchema,
  tags: farosTagsValidationSchema,
  metrics: farosMetricsValidationSchema,
  agent: agentValidationSchema,
};

const runStepItemValidationSchema = {
  type: 'object',
  properties: runStepSchemaDefinition,
  required: ['id'],
  dependencies: {
    typeDetails: {required: ['type']},
    statusDetails: {required: ['status']},
  },
  additionalProperties: false,
};

const runStepValidationSchema = {
  anyOf: [
    runStepItemValidationSchema,
    {
      type: 'array',
      items: runStepItemValidationSchema,
    },
  ],
};

export interface Run {
  readonly uri?: string;
  readonly id?: string;
  readonly number?: number;
  readonly pipeline?: string;
  readonly organization?: string;
  readonly source?: string;
  readonly status?: string;
  readonly statusDetails?: string;
  readonly createTime?: string | number;
  readonly startTime?: string | number;
  readonly endTime?: string | number;
  readonly step?: RunStep[] | RunStep;
  readonly tags?: FarosTag[] | string;
  readonly metrics?: FarosMetric[];
  readonly url?: string;
}

const runSchemaDefinition = {
  uri: uriValidationSchema,
  id: stringValidationSchema,
  number: integerValidationSchema,
  pipeline: stringValidationSchema,
  organization: stringValidationSchema,
  source: stringValidationSchema,
  status: stringValidationSchema,
  statusDetails: {type: 'string'}, // Truncated later
  createTime: timestampValidationSchema,
  startTime: timestampValidationSchema,
  endTime: timestampValidationSchema,
  step: runStepValidationSchema,
  tags: farosTagsValidationSchema,
  metrics: farosMetricsValidationSchema,
  url: stringValidationSchema,
};

export const runValidationSchema = {
  type: 'object',
  properties: runSchemaDefinition,
  oneOf: [
    {
      required: ['uri'],
      errorMessage: {
        required: ONE_OF_URI_OR_RUN_IDS_ERROR_MESSAGE,
      },
    },
    {
      required: ['source', 'organization', 'pipeline', 'id'],
      errorMessage: {
        required: ONE_OF_URI_OR_RUN_IDS_ERROR_MESSAGE,
      },
    },
  ],
  dependencies: {
    statusDetails: {required: ['status']},
  },
  errorMessage: {
    oneOf: ONE_OF_URI_OR_RUN_IDS_ERROR_MESSAGE,
  },
  additionalProperties: false,
};

export interface Artifact {
  readonly uri?: string;
  readonly id?: string;
  readonly repository?: string;
  readonly organization?: string;
  readonly source?: string;
}

const artifactSchemaDefinition = {
  uri: uriValidationSchema,
  id: stringValidationSchema,
  repository: stringValidationSchema,
  organization: stringValidationSchema,
  source: stringValidationSchema,
};

export const artifactValidationSchema = {
  type: 'object',
  properties: artifactSchemaDefinition,
  oneOf: [
    {
      required: ['uri'],
      errorMessage: {
        required: ONE_OF_URI_OR_ARTIFACT_IDS_ERROR_MESSAGE,
      },
    },
    {
      required: ['source', 'organization', 'repository', 'id'],
      errorMessage: {
        required: ONE_OF_URI_OR_ARTIFACT_IDS_ERROR_MESSAGE,
      },
    },
  ],
  errorMessage: {
    oneOf: ONE_OF_URI_OR_ARTIFACT_IDS_ERROR_MESSAGE,
  },
};

export interface Commit {
  readonly uri?: string;
  readonly sha?: string;
  readonly pullRequestNumber?: number | string;
  readonly repository?: string;
  readonly organization?: string;
  readonly source?: string;
  readonly branch?: string;
}

const pullRequestNumberDefinition = {
  oneOf: [
    {
      type: 'string',
      pattern: numberPattern,
    },
    {
      type: 'number',
    },
  ],
  errorMessage: {
    oneOf: INVALID_PULL_REQUEST_NUMBER_ERROR_MESSAGE,
  },
};

const commitSchemaDefinition = {
  uri: uriValidationSchema,
  sha: stringValidationSchema,
  pullRequestNumber: pullRequestNumberDefinition,
  repository: stringValidationSchema,
  organization: stringValidationSchema,
  source: stringValidationSchema,
  branch: stringValidationSchema,
};

export const commitValidationSchema = {
  type: 'object',
  properties: commitSchemaDefinition,
  oneOf: [
    {
      required: ['uri'],
      errorMessage: {
        required: ONE_OF_URI_OR_COMMIT_IDS_ERROR_MESSAGE,
      },
    },
    {
      required: ['source', 'organization', 'repository', 'sha'],
      errorMessage: {
        required: ONE_OF_URI_OR_COMMIT_IDS_ERROR_MESSAGE,
      },
    },
  ],
  errorMessage: {
    onOf: ONE_OF_URI_OR_COMMIT_IDS_ERROR_MESSAGE,
  },
};

export const commaStringOrStringArrayValidationSchema = {
  oneOf: [
    {
      type: 'string',
      pattern: commaArrayPattern,
    },
    {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  ],
};
