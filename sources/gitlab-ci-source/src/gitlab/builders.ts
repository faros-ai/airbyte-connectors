import {Dictionary} from 'ts-essentials';

import {Group, Job, Pipeline, Project} from './types';

export const buildGroup = (item: Dictionary<any>): Group => ({
  id: item.id,
  createdAt: item.created_at,
  description: item.description,
  name: item.name,
  path: item.path,
  fullPath: item.full_path,
  visibility: item.visibility,
  webUrl: item.web_url,
});

export const buildProject = (item: Dictionary<any>): Project => ({
  id: item.id,
  archived: item.archived,
  createdAt: item.created_at,
  defaultBranch: item.default_branch,
  description: item.description,
  name: item.name,
  path: item.path,
  pathWithNamespace: item.path_with_namespace,
  visibility: item.visibility,
  webUrl: item.web_url,
});

export const buildPipeline = (item: Dictionary<any>): Pipeline => ({
  id: item.id,
  commitSha: item.sha,
  projectId: item.project_id,
  status: item.status,
  createdAt: item.created_at,
  updatedAt: item.updated_at,
  webUrl: item.web_url,
});

export const buildJob = (item: Dictionary<any>): Job => ({
  id: item.id,
  duration: item.duration,
  name: item.name,
  createdAt: item.created_at,
  finishedAt: item.finished_at,
  startedAt: item.started_at,
  pipeline: buildPipeline(item.pipeline),
  stage: item.stage,
  status: item.status,
  webUrl: item.web_url,
});
