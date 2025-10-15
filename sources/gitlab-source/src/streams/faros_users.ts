import {StreamKey} from 'faros-airbyte-cdk';
import {FarosUserOutput} from 'faros-airbyte-common/gitlab';
import {Dictionary} from 'ts-essentials';

import {GitLab} from '../gitlab';
import {StreamBase} from './common';

export class FarosUsers extends StreamBase {
  /**
   * Users stream depends on other streams to ensure users are collected
   * from various sources before emitting user records.
   */
  get dependencies(): ReadonlyArray<string> {
    return [
      'faros_issues',
      'faros_merge_requests',
      'faros_merge_request_reviews',
    ];
  }

  getJsonSchema(): Dictionary<any, string> {
    return require('../../resources/schemas/farosUsers.json');
  }

  get primaryKey(): StreamKey {
    return ['username'];
  }

  // Although not actually an incremental stream, we run it in incremental mode
  // to avoid deleting the users that are written by other incremental streams.
  get supportsIncremental(): boolean {
    return true;
  }

  // Not used, but necessary to pass Airbyte UI validation check
  get cursorField(): string | string[] {
    return 'web_url';
  }

  async *readRecords(): AsyncGenerator<FarosUserOutput> {
    const gitlab = await GitLab.instance(this.config, this.logger);
    for (const group of await this.groupFilter.getGroups()) {
      this.logger.info(`Fetching users for group ${group}`);
      try {
        await gitlab.fetchGroupMembers(group);
      } catch (err: any) {
        if (
          err.message?.includes('Forbidden') ||
          err.cause?.message?.includes('Forbidden') ||
          err.cause?.description === 'Forbidden'
        ) {
          this.logger.warn(
            `Skipping group ${group} due to insufficient permissions to list members: ${err.message}`
          );
        } else {
          throw err;
        }
      }
      for (const project of await this.groupFilter.getProjects(group)) {
        this.logger.info(
          `Fetching users for project ${project.repo.path_with_namespace}`
        );
        try {
          await gitlab.fetchProjectMembers(project.repo.path_with_namespace);
        } catch (err: any) {
          if (
            err.message?.includes('Forbidden') ||
            err.cause?.message?.includes('Forbidden') ||
            err.cause?.description === 'Forbidden'
          ) {
            this.logger.warn(
              `Skipping project ${project.repo.path_with_namespace} due to insufficient permissions to list members: ${err.message}`
            );
          } else {
            throw err;
          }
        }
      }
    }
    const users = gitlab.userCollector.getCollectedUsers();
    for (const user of users.values()) {
      yield user;
    }
  }
}
