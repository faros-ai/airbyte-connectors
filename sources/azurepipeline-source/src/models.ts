export interface PipelineResponse {
  count: number;
  value: Pipeline[];
}

export interface Pipeline {
  id: number;
  revision: number;
  name?: string;
  url?: string;
  folder?: string;
}
