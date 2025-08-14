export interface cicd_Agent {
  uid: string;
  source: string;
}

export interface cicd_Artifact {
  uid: string;
  repository: {
    uid: string;
    organization: {
      uid: string;
      source: string;
    };
  };
}

export interface cicd_Build {
  uid: string;
  pipeline: {
    uid: string;
    organization: {
      uid: string;
      source: string;
    };
  };
}

export interface cicd_Deployment {
  uid: string;
  source: string;
}

export interface compute_Instance {
  uid: string;
  source: string;
}

export interface faros_MetricValue {
  uid: string;
  definition: {
    uid: string;
  };
}

export interface faros_Tag {
  uid: string;
}

export interface vcs_Commit {
  sha: string;
  repository: {
    name: string;
    organization: {
      uid: string;
      source: string;
    };
  };
}
