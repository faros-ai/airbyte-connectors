export interface Repository {
  readonly url: string;
  readonly owner: string;
  readonly name: string;
  readonly integration_type: string;
}

export interface ProjectSpec {
  readonly visibility: string;
  readonly repository: Repository;
}

export interface ProjectMeta {
  readonly owner_id: string;
  readonly org_id: string;
  readonly name: string;
  readonly id: string;
  readonly description: string;
}

export interface Project {
  readonly spec: ProjectSpec;
  readonly metadata: ProjectMeta;
}

export interface Pipeline {
  readonly terminate_request: string;
  readonly queuing_at: string;
  readonly working_directory: string;
  readonly name: string;
  readonly branch_id: string;
  readonly project_id: string;
  readonly running_at: string;
  readonly partially_rerun_by: string;
  readonly with_after_task: string;
  readonly state: string;
  jjkk;
  readonly snapshot_id: string;
  readonly commit_message: string;
  readonly commit_sha: string;
  readonly terminated_by: string;
  readonly after_task_id: string;
  readonly created_at: string;
  readonly error_description: string;
  readonly repository_id: string;
  readonly yaml_file_name: string;
  readonly pending_at: string;
  readonly ppl_id: string;
  readonly stopping_at: string;
  readonly wf_id: string;
  readonly done_at: string;
  readonly result: string;
  readonly compile_task_id: string;
  readonly hook_id: string;
  readonly branch_name: string;
  readonly promotion_of: string;
  readonly switch_id: string;
  readonly result_reason: string;
  readonly partial_rerun_of: string;
  project: Project;
}
