export interface GitLabUserResponse {
  id: number;
  username: string;
  name?: string;
  email?: string;
  public_email?: string;
  publicEmail?: string;
  state: string;
  web_url: string;
  webUrl?: string;
  created_at?: string;
  updated_at?: string;
  group_id?: string;
}
