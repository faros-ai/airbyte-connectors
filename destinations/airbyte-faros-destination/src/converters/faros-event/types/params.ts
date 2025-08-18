export interface Params {
  validateOnly?: boolean;
  skipSavingRun?: boolean;
  noArtifact?: boolean;
  noDeployUidPrefix?: boolean;
}

const paramsSchemaDefinition = {
  validateOnly: {type: 'boolean'},
  skipSavingRun: {type: 'boolean'},
  noArtifact: {type: 'boolean'},
  noDeployUidPrefix: {type: 'boolean'},
};

export const paramsValidationSchema = {
  type: 'object',
  properties: paramsSchemaDefinition,
  additionalProperties: false,
};
