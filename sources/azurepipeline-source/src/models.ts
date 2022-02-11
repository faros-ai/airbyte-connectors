export interface PipelineResponse {
  count: number;
  value: Pipeline[];
}

interface PipelineHref {
  href: string;
}

interface PipelineLink {
  self: PipelineHref;
  web: PipelineHref;
}

export interface Pipeline {
  id: number;
  revision: number;
  name?: string;
  url?: string;
  folder?: string;
  _links: PipelineLink[];
}
