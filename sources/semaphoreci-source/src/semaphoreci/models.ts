export interface Repository {
  readonly integration_type: string;
  readonly name: string;
  readonly owner: string;
  readonly url: string;
}

export interface ProjectSpec {
  readonly visibility: string;
  readonly repository: Repository;
}

export interface ProjectMeta {
  readonly description: string;
  readonly id: string;
  readonly name: string;
  readonly org_id: string;
  readonly owner_id: string;
}

export interface Project {
  readonly metadata: ProjectMeta;
  readonly spec: ProjectSpec;
}

export interface JobMetadata {
  readonly name: string;
  readonly id: string;
  readonly create_time: string;
  readonly update_time: string;
  readonly start_time: string;
  readonly finish_time: string;
}

export interface JobSpec {
  readonly project_id: string;
  readonly agent: {
    machine: {
      type: string;
      os_image: string;
    };
  };
  readonly env_vars: {
    name: string;
    value: string;
  }[];
  readonly commands: string[];
}

export interface JobStatus {
  readonly result: string;
  readonly state: string;
}

export interface Job {
  readonly metadata: JobMetadata;
  readonly spec: JobSpec;
  readonly status: JobStatus;
}

export interface BlockJob {
  readonly status: string;
  readonly result: string;
  readonly name: string;
  readonly job_id: string;
  readonly index: number;
}

export interface Block {
  readonly state: string;
  readonly result_reason: string;
  readonly result: string;
  readonly name: string;
  readonly jobs: BlockJob[];
}

export interface PipelineDetailed {
  readonly pipeline: Pipeline;
  readonly blocks: Block[];
}

export interface Pipeline {
  readonly after_task_id: string;
  readonly branch_id: string;
  readonly branch_name: string;
  readonly commit_message: string;
  readonly commit_sha: string;
  readonly compile_task_id: string;
  readonly created_at: string;
  readonly done_at: string;
  readonly error_description: string;
  readonly hook_id: string;
  readonly name: string;
  readonly partial_rerun_of: string;
  readonly partially_rerun_by: string;
  readonly pending_at: string;
  readonly ppl_id: string;
  readonly project_id: string;
  readonly promotion_of: string;
  readonly queuing_at: string;
  readonly repository_id: string;
  readonly result: string;
  readonly result_reason: string;
  readonly running_at: string;
  readonly snapshot_id: string;
  readonly state: string;
  readonly stopping_at: string;
  readonly switch_id: string;
  readonly terminate_request: string;
  readonly terminated_by: string;
  readonly wf_id: string;
  readonly with_after_task: string;
  readonly working_directory: string;
  readonly yaml_file_name: string;

  project: Project;
  jobs: Job[];
}
