export interface AsanaResponse<T> {
  data: T[];
  next_page: {offset: string} | null;
}

export type Workspace = {
  gid: string;
  name: string;
  resource_type: string;
};

export type CompactTask = {
  gid?: string;
  name?: string;
  resource_type?: string;
  resource_subtype?: string;
};

export type Task = {
  gid?: string;
  resource_type?: string;
  name?: string;
  approval_status?: string;
  completed?: boolean;
  completed_at?: string;
  completed_by?: {
    gid?: string;
    resource_type?: string;
    name?: string;
  };
  created_at?: string;
  dependencies?: ReadonlyArray<{
    gid?: string;
    resource_type?: string;
  }>;
  dependents?: ReadonlyArray<{
    gid?: string;
    resource_type?: string;
  }>;
  due_at?: string;
  due_on?: string;
  external?: {
    data?: string;
    gid?: string;
  };
  hearted?: boolean;
  hearts?: ReadonlyArray<{
    gid?: string;
    user?: {
      gid?: string;
      resource_type?: string;
      name?: string;
    };
  }>;
  html_notes?: string;
  is_rendered_as_separator?: boolean;
  liked?: boolean;
  likes?: ReadonlyArray<{
    gid?: string;
    user?: {
      gid?: string;
      resource_type?: string;
      name?: string;
    };
  }>;
  memberships?: ReadonlyArray<{
    project?: {
      gid?: string;
      resource_type?: string;
      name?: string;
    };
    section?: {
      gid?: string;
      resource_type?: string;
      name?: string;
    };
  }>;
  modified_at?: string;
  notes?: string;
  num_hearts?: number;
  num_likes?: number;
  num_subtasks?: number;
  resource_subtype?: string;
  start_on?: string;
  assignee?: {
    gid?: string;
    resource_type?: string;
    name?: string;
  };
  custom_fields?: ReadonlyArray<{
    gid?: string;
    resource_type?: string;
    created_by?: {
      gid?: string;
      resource_type?: string;
      name?: string;
    };
    currency_code?: string;
    custom_label?: string;
    custom_label_position?: string;
    description?: string;
    display_value?: string;
    enabled?: boolean;
    enum_options?: ReadonlyArray<{
      gid?: string;
      resource_type?: string;
      color?: string;
      enabled?: boolean;
      name?: string;
    }>;
    enum_value?: {
      gid?: string;
      resource_type?: string;
      color?: string;
      enabled?: boolean;
      name?: string;
    };
    format?: string;
    has_notifications_enabled?: boolean;
    is_global_to_workspace?: boolean;
    name?: string;
    number_value?: number;
    precision?: number;
    resource_subtype?: string;
    text_value?: string;
    type?: string;
  }>;
  followers?: ReadonlyArray<{
    gid?: string;
    resource_type?: string;
    name?: string;
  }>;
  parent?: {
    gid?: string;
    resource_type?: string;
    name?: string;
  };
  permalink_url?: string;
  projects?: ReadonlyArray<{
    gid?: string;
    resource_type?: string;
    name?: string;
  }>;
  tags?: ReadonlyArray<{
    gid?: string;
    name?: string;
  }>;
  workspace?: {
    gid?: string;
    resource_type?: string;
    name?: string;
  };
  stories?: ReadonlyArray<Story>;
  comments?: ReadonlyArray<Story>;
};

export type Project = {
  gid: string;
  resource_type: string;
  name: string;
  archived: boolean;
  color: string;
  created_at: string;
  current_status: {
    gid: string;
    resource_type: string;
    title: string;
    author: {
      gid: string;
      resource_type: string;
      name: string;
    };
    color: string;
    html_text: string;
    modified_at: string;
    text: string;
    created_at: string;
    created_by: {
      gid: string;
      resource_type: string;
      name: string;
    };
  };
  custom_field_settings: ReadonlyArray<{
    gid: string;
    resource_type: string;
  }>;
  default_view: string;
  due_date: string;
  due_on: string;
  html_notes: string;
  is_template: boolean;
  members: ReadonlyArray<{
    gid: string;
    resource_type: string;
    name: string;
  }>;
  modified_at: string;
  notes: string;
  public: boolean;
  start_on: string;
  workspace: {
    gid: string;
    resource_type: string;
    name: string;
  };
  custom_fields: ReadonlyArray<{
    gid: string;
    resource_type: string;
    display_value: string;
    enabled: boolean;
    enum_options: ReadonlyArray<{
      gid: string;
      resource_type: string;
      color: string;
      enabled: boolean;
      name: string;
    }>;
    name: string;
    number_value: number;
    resource_subtype: string;
    text_value: string;
    type: string;
  }>;
  followers: ReadonlyArray<{
    gid: string;
    resource_type: string;
    name: string;
  }>;
  icon: string;
  owner: {
    gid: string;
    resource_type: string;
    name: string;
  };
  permalink_url: string;
  team: {
    gid: string;
    resource_type: string;
    name: string;
  };
};

export type Section = {
  gid: string;
  resource_type: string;
  name: string;
  created_at: string;
  project: {
    gid: string;
    resource_type: string;
    name: string;
  };
};

export type ProjectTaskAssociation = {
  project_gid?: string;
  task_gid?: string;
};

export type Story = {
  gid: string;
  resource_type: string;
  created_at: string;
  created_by: {
    gid: string;
    resource_type: string;
    name: string;
  };
  resource_subtype: string;
  text: string;
  type: string;
  assignee: {
    gid: string;
    resource_type: string;
  };
  target: {
    gid: string;
    resource_type: string;
  };
};

export type User = {
  gid?: string;
  resource_type?: string;
  name?: string;
  email?: string;
};

export type Tag = {
  gid?: string;
  resource_type?: string;
  color?: string;
  followers?: ReadonlyArray<{
    gid?: string;
    resource_type?: string;
    name?: string;
  }>;
  name?: string;
  permalink_url?: string;
  workspace?: {
    gid?: string;
    resource_type?: string;
    name?: string;
  };
};
