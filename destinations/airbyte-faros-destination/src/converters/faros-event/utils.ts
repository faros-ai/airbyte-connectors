import {ErrorObject} from 'ajv';
import {groupBy} from 'lodash';

import {Artifact, FarosPath, FarosTag, RunStep} from './types';

interface OrganizationKey {
  readonly uid: string;
  readonly source: string;
}

export interface DeploymentKey {
  readonly uid: string;
  readonly source: string;
}

export interface DeployIds {
  readonly id: string;
  readonly source: string;
  readonly environment: string;
  readonly application: string;
}

export interface ArtifactKey {
  readonly uid: string;
  readonly repository: {
    readonly uid: string;
    readonly organization: OrganizationKey;
  };
}

export interface ArtifactIds {
  readonly id: string;
  readonly repository: string;
  readonly organization: string;
  readonly source: string;
}

export interface CommitKey {
  readonly sha: string;
  readonly repository: {
    readonly name: string;
    readonly organization: OrganizationKey;
  };
}

export interface CommitIds {
  readonly sha: string;
  readonly repository: string;
  readonly organization: string;
  readonly source: string;
}

export interface BuildKey {
  readonly uid: string;
  readonly pipeline: {
    readonly uid: string;
    readonly organization: OrganizationKey;
  };
}

export interface BuildIds {
  readonly id: string;
  readonly pipeline: string;
  readonly organization: string;
  readonly source: string;
}

export interface BuildStepKey {
  readonly uid: string;
  readonly build: BuildKey;
}

export interface AgentKey {
  readonly uid: string;
  readonly source: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function resolveCommitIds(commit: any): CommitIds {
  if (commit.uri) {
    const parsedUri = parseUri(commit.uri);
    return {
      sha: parsedUri[3],
      repository: parsedUri[2].toLowerCase(),
      organization: parsedUri[1].toLowerCase(),
      source: parsedUri[0],
    };
  }
  return {
    sha: commit.sha,
    repository: commit.repository.toLowerCase(),
    organization: commit.organization.toLowerCase(),
    source: commit.source,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function makeCommitKey(commit: any): CommitKey {
  const commitIds = resolveCommitIds(commit);
  return {
    sha: commitIds.sha,
    repository: {
      name: commitIds.repository,
      organization: {
        uid: commitIds.organization,
        source: commitIds.source,
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function resolveBuildIds(run: any): BuildIds {
  if (run.uri) {
    const parsedUri = parseUri(run.uri);
    return {
      id: parsedUri[3],
      pipeline: parsedUri[2],
      organization: parsedUri[1],
      source: parsedUri[0],
    };
  }
  return {
    id: run.id,
    pipeline: run.pipeline,
    organization: run.organization,
    source: run.source,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function makeBuildKey(run: any): BuildKey {
  const buildIds = resolveBuildIds(run);
  return {
    uid: buildIds.id,
    pipeline: {
      uid: buildIds.pipeline,
      organization: {
        uid: buildIds.organization,
        source: buildIds.source,
      },
    },
  };
}

export function makeBuildStepKey(step: RunStep, build: BuildKey): BuildStepKey {
  return {
    uid: step.id,
    build,
  };
}

export function resolveDeploymentIds(deploy: any): DeployIds {
  let deployIds;
  if (deploy.uri) {
    const parsedUri = parseUri(deploy.uri);
    deployIds = {
      id: parsedUri[3],
      environment: parsedUri[2],
      application: parsedUri[1],
      source: parsedUri[0],
    };
  } else {
    deployIds = {
      id: deploy.id,
      environment: deploy.environment,
      application: deploy.application,
      source: deploy.source,
    };
  }
  return deployIds;
}

function enumToMap(enumValues: string[]): Map<string, string> {
  return new Map(enumValues.map((value) => [value.toLowerCase(), value]));
}

function resolveEnum(
  enumValue: Map<string, string>,
  field: string,
  fieldDetail?: string | null
): {category: string; detail?: string | null} {
  const lowerField = field.toLowerCase();
  const value = enumValue.get(lowerField);
  if (value) {
    return {category: value, detail: fieldDetail};
  }
  return {
    category: 'Custom',
    detail: field.concat(fieldDetail ? ` - ${fieldDetail}` : ''),
  };
}

const deploymentEnvironments = enumToMap([
  'Prod',
  'Staging',
  'QA',
  'Dev',
  'Sandbox',
  'Canary',
  'Custom',
]);

export function resolveDeploymentEnvironment(
  environment: string,
  environmentDetails?: string | null
): {category: string; detail?: string | null} {
  return resolveEnum(deploymentEnvironments, environment, environmentDetails);
}

const deploymentStatuses = enumToMap([
  'Canceled',
  'Custom',
  'Failed',
  'Queued',
  'Running',
  'RolledBack',
  'Success',
]);

export function resolveDeploymentStatus(
  status?: string,
  statusDetails?: string | null
): {category: string; detail?: string | null} | undefined {
  if (!status) {
    return undefined;
  }
  return resolveEnum(deploymentStatuses, status, statusDetails);
}

const runStatuses = enumToMap([
  'Canceled',
  'Custom',
  'Failed',
  'Queued',
  'Running',
  'Success',
  'Unknown',
]);

export function resolveRunStatus(
  status?: string,
  statusDetails?: string | null
): {category: string; detail?: string | null} | undefined {
  if (!status) {
    return undefined;
  }
  return resolveEnum(runStatuses, status, statusDetails);
}

const runStepTypes = enumToMap(['Custom', 'Manual', 'Script']);

export function resolveRunStepType(
  type?: string,
  typeDetails?: string | null
): {category: string; detail?: string | null} | undefined {
  if (!type) {
    return undefined;
  }
  return resolveEnum(runStepTypes, type, typeDetails);
}

const computeAgentOS = enumToMap(['Linux', 'MacOS', 'Windows', 'Custom']);

export function resolveComputeAgentOS(
  os?: string,
  osDetails?: string | null
): {category: string; detail?: string | null} | undefined {
  if (!os) {
    return undefined;
  }
  return resolveEnum(computeAgentOS, os, osDetails);
}

const metricDefinitionTypes = enumToMap([
  'Numeric',
  'String',
  'Date',
  'Timestamp',
  'Duration',
  'Percentage',
  'Custom',
]);

export function resolveMetricDefinitionType(
  type?: string,
  typeDetails?: string | null
): {category: string; detail?: string | null} | undefined {
  if (!type) {
    return undefined;
  }
  return resolveEnum(metricDefinitionTypes, type, typeDetails);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function resolveArtifactIds(artifact: any): ArtifactIds {
  if (artifact.uri) {
    const parsedUri = parseUri(artifact.uri);
    return {
      id: parsedUri[3],
      repository: parsedUri[2].toLowerCase(),
      organization: parsedUri[1].toLowerCase(),
      source: parsedUri[0],
    };
  }
  return {
    id: artifact.id,
    repository: artifact.repository.toLowerCase(),
    organization: artifact.organization.toLowerCase(),
    source: artifact.source,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function makeArtifactKey(artifact: any): ArtifactKey {
  const artifactIds = resolveArtifactIds(artifact);
  return {
    uid: artifactIds.id,
    repository: {
      uid: artifactIds.repository.toLowerCase(),
      organization: {
        uid: artifactIds.organization.toLowerCase(),
        source: artifactIds.source,
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function makeDummyArtifact(commit: any): Artifact {
  const commitKey = makeCommitKey(commit);
  return {
    id: commitKey.sha,
    repository: commitKey.repository.name,
    organization: commitKey.repository.organization.uid,
    source: commitKey.repository.organization.source,
  };
}

// Convert ISO-8601 string, number string, number, or 'Now' into milliseconds
export function getTime(date?: string | number): number | undefined {
  if (date) {
    if (typeof date === 'string') {
      if (date === 'Now') {
        return Date.now();
      }
      const dateInt = Number(date);
      if (!isNaN(dateInt)) {
        return new Date(dateInt).getTime();
      }
    }
    return new Date(date).getTime();
  }
  return undefined;
}

// Convert ISO-8601 string, number string, number, or 'Now' into ISO-8601 string
export function toDate(date?: string | number): string | undefined {
  if (date) {
    if (typeof date === 'string') {
      if (date === 'Now') {
        return new Date(Date.now()).toISOString();
      }
      const dateInt = Number(date);
      if (!isNaN(dateInt)) {
        return new Date(dateInt).toISOString();
      }
    }
    return new Date(date).toISOString();
  }
  return undefined;
}

export function parseTags(tags?: FarosTag[] | string): FarosTag[] | undefined {
  const parser = (input: string): FarosTag[] => {
    const resTags: FarosTag[] = [];
    const keyValues = input.split(',');
    for (const keyValue of keyValues) {
      const splitTag = keyValue.split(':');
      resTags.push({key: splitTag[0], value: splitTag[1]});
    }
    return resTags;
  };
  return parseArray(parser, tags);
}

export function parsePaths(
  paths?: FarosPath[] | string
): FarosPath[] | undefined {
  const parser = (input: string): FarosPath[] => {
    return input.split(',').map<FarosPath>((path) => {
      return {path};
    });
  };
  return parseArray(parser, paths);
}

export function parsePullRequestNumber(
  number: string | number
): number | undefined {
  const prNum = typeof number === 'string' ? Number(number) : number;
  return isNaN(prNum) ? undefined : prNum;
}

export function parseUri(uri: string): string[] {
  const components: string[] = [];
  const split1 = uri.split('://');
  components.push(split1[0]);
  split1[1].split('/').forEach((value) => components.push(value));
  return components;
}

export function parseStringArray(
  array?: string[] | string,
  separator = ','
): string[] | undefined {
  return parseArray((s) => s.split(separator), array);
}

function parseArray<T>(
  parser: (input: string) => T[],
  input?: T[] | string
): T[] | undefined {
  if (typeof input === 'string') {
    return parser(input);
  }
  return input;
}

export interface EventValidationError {
  readonly message: string;
  readonly details?: ReadonlyArray<string>;
  readonly allowedValues?: ReadonlyArray<string>;
  readonly additionalProperties?: ReadonlyArray<string>;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function removeUndefinedProperties(object: any): any {
  const result = {...object};
  Object.keys(result).forEach(
    (key) => result[key] === undefined && delete result[key]
  );
  return result;
}

export function formatErrors(
  errors?: ErrorObject[] | null,
  rootObject?: string
): ReadonlyArray<EventValidationError> {
  if (!errors) {
    return [];
  }

  const formattedErrors: EventValidationError[] = [];
  const groupedErrors = groupBy<ErrorObject>(errors, (err) => {
    return formatErrorDetailsMessage(err, rootObject);
  });

  for (const [message, errs] of Object.entries(groupedErrors)) {
    const details = errs.flatMap(
      (err) =>
        err.params?.errors?.map((v: any) =>
          formatErrorDetailsMessage(v, rootObject)
        ) ?? []
    );
    const additionalProperties = errs.flatMap(
      (err) => err.params?.additionalProperty ?? []
    );
    formattedErrors.push({
      message,
      details: details.length > 0 ? details : undefined,
      allowedValues: getAllowedValues(errs),
      additionalProperties:
        additionalProperties.length > 0 ? additionalProperties : undefined,
    });
  }
  return formattedErrors;
}

function formatErrorDetailsMessage(
  error: ErrorObject,
  rootObject = 'data'
): string {
  const prefix = error?.instancePath
    ? `${rootObject}${error.instancePath.replace(/\//g, '.')} `
    : `${rootObject} `;
  return `${prefix}${error.message}`;
}

function getAllowedValues(errors: ErrorObject[]): string[] | undefined {
  let result;
  if (errors?.length > 0) {
    result = errors[0].params?.allowedValues;
    if (!result && errors[0].params?.errors?.length > 0) {
      result = errors[0].params?.errors[0].params?.allowedValues;
    }
  }
  return result;
}

// Max length for free-form description text fields such as issue body
const MAX_TEXT_LENGTH = 1000;
export function cleanAndTruncate(
  str?: string,
  maxLength?: number
): string | null | undefined {
  if (!str) {
    return str;
  }
  const length = maxLength ?? MAX_TEXT_LENGTH;
  let result: string;
  if (str.length <= length) {
    result = str;
  } else {
    // If the last character is part of a unicode surrogate pair, include the next character
    const lastChar = str.codePointAt(length - 1) ?? 0;
    result =
      lastChar > 65535
        ? str.substring(0, length + 1)
        : str.substring(0, length);
  }
  // eslint-disable-next-line no-control-regex
  return result.replace(/\u0000/g, '');
}
