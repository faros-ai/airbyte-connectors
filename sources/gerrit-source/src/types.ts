import {RunMode} from './streams/common';

export interface GerritConfig {
  readonly url: string;
  readonly authentication: GerritAuthentication;
  readonly reject_unauthorized?: boolean;
  readonly projects?: string[];
  readonly excluded_projects?: string[];
  readonly run_mode?: RunMode;
  readonly custom_streams?: string[];
  readonly fetch_reviews?: boolean;
  readonly fetch_comments?: boolean;
  readonly cutoff_days?: number;
  readonly bucket_id?: number;
  readonly bucket_total?: number;
  readonly page_size?: number;
  readonly timeout?: number;
  readonly concurrency_limit?: number;
  readonly start_date?: string;
  readonly end_date?: string;

  // Computed fields
  readonly startDate?: Date;
  readonly endDate?: Date;
}

export type GerritAuthentication =
  | HttpPasswordAuthentication
  | CookieAuthentication
  | GitCookieAuthentication;

export interface HttpPasswordAuthentication {
  readonly type: 'http_password';
  readonly username: string;
  readonly password: string;
}

export interface CookieAuthentication {
  readonly type: 'cookie';
  readonly cookie_value: string;
}

export interface GitCookieAuthentication {
  readonly type: 'git_cookie';
  readonly git_cookie_value: string;
}

// Gerrit API response types
export interface GerritProject {
  readonly id: string;
  readonly name?: string;
  readonly parent?: string;
  readonly description?: string;
  readonly state?: 'ACTIVE' | 'READ_ONLY' | 'HIDDEN';
  readonly branches?: {[key: string]: string};
  readonly labels?: {[key: string]: any};
  readonly web_links?: WebLink[];
}

export interface GerritChange {
  readonly id: string;
  readonly project: string;
  readonly branch: string;
  readonly topic?: string;
  readonly attention_set?: {[key: string]: AttentionSetInfo};
  readonly assignee?: AccountInfo;
  readonly hashtags?: string[];
  readonly change_id: string;
  readonly subject: string;
  readonly status: 'NEW' | 'MERGED' | 'ABANDONED';
  readonly created: string;
  readonly updated: string;
  readonly submitted?: string;
  readonly submitter?: AccountInfo;
  readonly starred?: boolean;
  readonly stars?: string[];
  readonly reviewed?: boolean;
  readonly submit_type?: string;
  readonly mergeable?: boolean;
  readonly submittable?: boolean;
  readonly insertions?: number;
  readonly deletions?: number;
  readonly total_comment_count?: number;
  readonly unresolved_comment_count?: number;
  readonly _number: number;
  readonly owner: AccountInfo;
  readonly actions?: {[key: string]: ActionInfo};
  readonly labels?: {[key: string]: LabelInfo};
  readonly permitted_labels?: {[key: string]: string[]};
  readonly removable_reviewers?: AccountInfo[];
  readonly reviewers?: {[key: string]: AccountInfo[]};
  readonly pending_reviewers?: AccountInfo[];
  readonly reviewer_updates?: ReviewerUpdateInfo[];
  readonly messages?: ChangeMessageInfo[];
  readonly current_revision?: string;
  readonly revisions?: {[key: string]: RevisionInfo};
  readonly tracking_ids?: TrackingIdInfo[];
  readonly _more_changes?: boolean;
  readonly problems?: ProblemInfo[];
  readonly is_private?: boolean;
  readonly work_in_progress?: boolean;
  readonly has_review_started?: boolean;
  readonly revert_of?: number;
  readonly submission_id?: string;
  readonly cherry_pick_of_change?: number;
  readonly cherry_pick_of_patch_set?: number;
  readonly contains_git_conflicts?: boolean;
}

export interface AccountInfo {
  readonly _account_id?: number;
  readonly name?: string;
  readonly display_name?: string;
  readonly email?: string;
  readonly secondary_emails?: string[];
  readonly username?: string;
  readonly avatars?: AvatarInfo[];
  readonly _more_accounts?: boolean;
  readonly status?: string;
  readonly inactive?: boolean;
  readonly tags?: string[];
}

export interface AttentionSetInfo {
  readonly account: AccountInfo;
  readonly last_update: string;
  readonly reason: string;
}

export interface ActionInfo {
  readonly method?: string;
  readonly label?: string;
  readonly title?: string;
  readonly enabled?: boolean;
}

export interface LabelInfo {
  readonly optional?: boolean;
  readonly approved?: AccountInfo;
  readonly rejected?: AccountInfo;
  readonly recommended?: AccountInfo;
  readonly disliked?: AccountInfo;
  readonly blocking?: boolean;
  readonly value?: number;
  readonly default_value?: number;
  readonly values?: {[key: string]: string};
  readonly all?: ApprovalInfo[];
}

export interface ApprovalInfo {
  readonly account?: AccountInfo;
  readonly value?: number;
  readonly permitted_voting_range?: VotingRangeInfo;
  readonly date?: string;
  readonly tag?: string;
  readonly post_submit?: boolean;
}

export interface VotingRangeInfo {
  readonly min: number;
  readonly max: number;
}

export interface ReviewerUpdateInfo {
  readonly updated: string;
  readonly updated_by: AccountInfo;
  readonly reviewer: AccountInfo;
  readonly state: 'REVIEWER' | 'CC' | 'REMOVED';
}

export interface ChangeMessageInfo {
  readonly id: string;
  readonly author?: AccountInfo;
  readonly real_author?: AccountInfo;
  readonly date: string;
  readonly message: string;
  readonly tag?: string;
  readonly _revision_number?: number;
}

export interface RevisionInfo {
  readonly kind: string;
  readonly _number: number;
  readonly created: string;
  readonly uploader: AccountInfo;
  readonly ref: string;
  readonly fetch?: {[key: string]: FetchInfo};
  readonly commit?: CommitInfo;
  readonly files?: {[key: string]: FileInfo};
  readonly actions?: {[key: string]: ActionInfo};
  readonly reviewed?: boolean;
  readonly commit_with_footers?: boolean;
  readonly push_certificate?: PushCertificateInfo;
  readonly description?: string;
}

export interface FetchInfo {
  readonly url: string;
  readonly ref: string;
  readonly commands?: {[key: string]: string};
}

export interface CommitInfo {
  readonly commit?: string;
  readonly parents: ParentCommitInfo[];
  readonly author: GitPersonInfo;
  readonly committer: GitPersonInfo;
  readonly subject: string;
  readonly message: string;
  readonly web_links?: WebLink[];
}

export interface ParentCommitInfo {
  readonly commit: string;
  readonly subject?: string;
}

export interface GitPersonInfo {
  readonly name: string;
  readonly email: string;
  readonly date: string;
  readonly tz: number;
}

export interface FileInfo {
  readonly status?: 'A' | 'D' | 'R' | 'C' | 'W';
  readonly binary?: boolean;
  readonly old_path?: string;
  readonly lines_inserted?: number;
  readonly lines_deleted?: number;
  readonly size_delta?: number;
  readonly size?: number;
}

export interface PushCertificateInfo {
  readonly certificate: string;
  readonly key: GpgKeyInfo;
}

export interface GpgKeyInfo {
  readonly status: string;
  readonly problems?: string[];
}

export interface TrackingIdInfo {
  readonly system: string;
  readonly id: string;
}

export interface ProblemInfo {
  readonly message: string;
  readonly status?: 'FIXED' | 'FIX_FAILED';
  readonly outcome?: string;
}

export interface AvatarInfo {
  readonly url: string;
  readonly height?: number;
  readonly width?: number;
}

export interface WebLink {
  readonly url: string;
  readonly name?: string;
  readonly image_url?: string;
  readonly target?: string;
}

export interface GerritGroup {
  readonly id: string;
  readonly name?: string;
  readonly url?: string;
  readonly options?: GroupOptionsInfo;
  readonly description?: string;
  readonly group_id?: number;
  readonly owner?: string;
  readonly owner_id?: string;
  readonly created_on?: string;
  readonly _more_groups?: boolean;
  readonly members?: AccountInfo[];
  readonly includes?: GroupInfo[];
}

export interface GroupInfo {
  readonly id: string;
  readonly name?: string;
  readonly url?: string;
  readonly options?: GroupOptionsInfo;
  readonly description?: string;
  readonly group_id?: number;
  readonly owner?: string;
  readonly owner_id?: string;
  readonly created_on?: string;
  readonly _more_groups?: boolean;
}

export interface GroupOptionsInfo {
  readonly visible_to_all?: boolean;
}
