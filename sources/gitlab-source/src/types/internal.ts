import {FarosUserOutput} from 'faros-airbyte-common/gitlab';
import {GitLabUserResponse} from './api';

export class UserMapper {
  static toOutput(apiUser: GitLabUserResponse): FarosUserOutput {
    return {
      __brand: 'FarosUser' as const,
      id: apiUser.id,
      username: apiUser.username,
      name: apiUser.name,
      email: apiUser.email || apiUser.public_email || apiUser.publicEmail,
      state: apiUser.state,
      web_url: apiUser.web_url || apiUser.webUrl,
      created_at: apiUser.created_at,
      updated_at: apiUser.updated_at,
      group_id: apiUser.group_id,
    };
  }
}
