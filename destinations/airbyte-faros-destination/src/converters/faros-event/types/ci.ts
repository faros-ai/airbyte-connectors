import {
  Artifact,
  artifactValidationSchema,
  Commit,
  commitValidationSchema,
  Run,
  runValidationSchema,
} from './common';

export const ONE_OF_CI_OBJECT =
  "must have either property 'artifact', 'commit', or 'run'";

export interface CIEvent {
  readonly commit?: Commit;
  readonly artifact?: Artifact;
  readonly run?: Run;
}

export const ciFullValidationSchema = {
  type: 'object',
  properties: {
    artifact: artifactValidationSchema,
    commit: commitValidationSchema,
    run: {...runValidationSchema, required: ['status']},
  },
  required: ['commit'],
  additionalProperties: false,
};

export const ciValidationSchema = {
  type: 'object',
  properties: {
    artifact: artifactValidationSchema,
    commit: commitValidationSchema,
    run: runValidationSchema,
  },
  anyOf: [
    {required: ['artifact']},
    {required: ['commit']},
    {required: ['run']},
  ],
  errorMessage: {
    anyOf: ONE_OF_CI_OBJECT,
  },
  additionalProperties: false,
};
