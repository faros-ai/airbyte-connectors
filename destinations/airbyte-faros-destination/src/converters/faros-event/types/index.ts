import Ajv, {ValidateFunction} from 'ajv';
import ajvErrors from 'ajv-errors';
import addFormats from 'ajv-formats';
import {AirbyteLogger} from 'faros-airbyte-cdk';

import {formatErrors} from '../utils';
import {CDEvent, cdValidationSchema, Deploy} from './cd';
import {CIEvent, ciValidationSchema} from './ci';
import {
  Agent,
  Artifact,
  Commit,
  ComputeInstance,
  FarosPath,
  FarosTag,
  Run,
  RunStep,
} from './common';
import {Params, paramsValidationSchema} from './params';

export type {
  Agent,
  Artifact,
  Commit,
  ComputeInstance,
  FarosPath,
  FarosTag,
  Run,
  RunStep,
};
export type {CDEvent, Deploy};
export type {CIEvent};
export type {Params};
export * from './cd';
export * from './ci';
export * from './common';
export * from './keys';
export * from './params';
const ajv = new Ajv({allErrors: true});
addFormats(ajv);
ajvErrors(ajv);
const cdEventValidate = ajv.compile<CDEvent>(cdValidationSchema);
const ciEventValidate = ajv.compile<CIEvent>(ciValidationSchema);
const paramsValidate = ajv.compile<Params>(paramsValidationSchema);

export enum UserEventType {
  CI = 'ci',
  CD = 'cd',
  TestExecution = 'testexecution',
}

function validate(
  validateFunction: ValidateFunction,
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  data: any,
  logger: AirbyteLogger,
  rootObject?: string
): boolean {
  const valid = validateFunction(data);
  if (!valid) {
    logger.asPino().error(
      formatErrors(validateFunction.errors, rootObject)
        .map((error) => JSON.stringify(error))
        .join('\n')
    );
    logger.asPino().error(JSON.stringify(data));
  }
  return valid;
}

export function validCDEvent(logger: AirbyteLogger, data: any): boolean {
  return validate(cdEventValidate, data, logger);
}

export function validCIEvent(logger: AirbyteLogger, data: any): boolean {
  return validate(ciEventValidate, data, logger);
}

export function validParams(logger: AirbyteLogger, params: any): boolean {
  if (!params) {
    return true; // No params to validate
  }
  return validate(paramsValidate, params, logger, 'params');
}
