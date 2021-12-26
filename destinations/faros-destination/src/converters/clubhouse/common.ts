import {ID, Label, PullRequest, StoryLink, Task} from 'clubhouse-lib';
import {AirbyteRecord} from 'faros-airbyte-cdk';

import {Converter, StreamContext} from '../converter';

export declare type StoryType = 'bug' | 'chore' | 'feature';
export interface Story {
  readonly app_url: string;
  readonly archived: boolean;
  readonly blocked: boolean;
  readonly blocker: boolean;
  readonly comments: Array<Comment>;
  readonly completed: boolean;
  readonly completed_at: string | null;
  readonly completed_at_override: string | null;
  readonly created_at: string;
  readonly cycle_time: number;
  readonly deadline: string | null;
  readonly description: string;
  readonly entity_type: string;
  readonly epic_id: number | null;
  readonly estimate: number | null;
  readonly external_id: string | null;
  readonly external_links: Array<string>;
  readonly files: Array<File>;
  readonly follower_ids: Array<ID>;
  readonly id: number;
  readonly iteration_id: number | null;
  readonly labels: Array<Label>;
  readonly lead_time: number;
  readonly member_mention_ids: Array<ID>;
  readonly mention_ids: Array<ID>;
  readonly moved_at: string | null;
  readonly name: string;
  readonly owner_ids: Array<ID>;
  readonly position: number;
  readonly previous_iteration_ids: Array<number>;
  readonly project_id: number;
  readonly requested_by_id: ID;
  readonly started: boolean;
  readonly started_at: string | null;
  readonly started_at_override: string | null;
  readonly story_links: Array<StoryLink>;
  readonly story_type: StoryType;
  readonly tasks: Array<Task>;
  readonly task_ids: Array<number>;
  readonly updated_at: string | null;
  readonly workflow_state_id: number;
  readonly pull_requests: Array<PullRequest>;
}

export interface Repository {
  created_ad: string;
  entity_type: string;
  external_id?: string | null;
  full_name: string;
  id: number;
  name: string;
  type: string;
  updated_at: string | null;
  url: string;
}
export type ApplicationMapping = Record<
  string,
  {name: string; platform?: string}
>;

interface ClubhouseConfig {
  application_mapping?: ApplicationMapping;
}

export class ClubhouseCommon {
  // Max length for free-form description text fields such as issue body
  static readonly MAX_DESCRIPTION_LENGTH = 1000;
}

/** Clubhouse converter base */
export abstract class ClubhouseConverter extends Converter {
  /** Almost every Clubhouse record have id property */
  id(record: AirbyteRecord): any {
    return record?.record?.data?.id;
  }

  protected ClubhouseConfig(ctx: StreamContext): ClubhouseConfig {
    return ctx.config.source_specific_configs?.Clubhouse ?? {};
  }

  protected applicationMapping(ctx: StreamContext): ApplicationMapping {
    return this.ClubhouseConfig(ctx).application_mapping ?? {};
  }
}
