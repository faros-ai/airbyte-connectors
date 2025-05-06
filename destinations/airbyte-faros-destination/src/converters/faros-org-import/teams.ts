import {AirbyteRecord} from 'faros-airbyte-cdk';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {DEFAULT_ROOT_TEAM_ID, FarosOrgImportConverter, lift} from './common';
import {Source, TeamRow} from './types';

interface TeamOwnersip {
  uid: string;
  name: string;
  applications: {
    application: {
      name: string;
      platform: string;
    };
  }[];
  boards: {
    board: {
      uid: string;
      source: string;
    };
  }[];
  pipelines: {
    pipeline: {
      uid: string;
      organization: {
        uid: string;
        source: string;
      };
    };
  }[];
  projects: {
    project: {
      uid: string;
      source: string;
    };
  }[];
  repositories: {
    repository: {
      name: string;
      organization: {
        uid: string;
        source: string;
      };
    };
  }[];
}

const TEAM_OWNERSHIP_QUERY = `
query teamOwnerships($origin: String!) {
  org_Team(where: {origin: {_eq: $origin}}) {
    uid
    name
    origin
    applications: applicationOwnerships {
      application {
        name
        platform
      }
    }
    boards: boardOwnerships {
      board {
        uid
        source
      }
    }
    pipelines: pipelineOwnerships {
      pipeline {
        uid
        organization {
          uid
          source
        }
      }
    }
    projects: projectOwnerships {
      project {
        uid
        source
      }
    }
    repositories: repositoryOwnerships {
      repository {
        name
        organization {
          uid
          source
        }
      }
    }
  }
}
`;

export class Teams extends FarosOrgImportConverter {
  private teamsToSync: TeamRow[] = [];
  private teamToParentMapping = new Map<string, string>();
  private surveyTeamMap = new Map<string, string[]>();

  private teamsMissingTeamName: string[] = [];
  private teamsMissingParentTeamId: string[] = [];
  private teamsMissingTeamLeadId: string[] = [];

  id(record: AirbyteRecord): any {
    return record?.record?.data?.teamId;
  }

  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'org_Team',
    'survey_OrgTeam',
    'org_CommunicationChannel',
  ];

  async convert(
    record: AirbyteRecord,
    ctx?: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    ctx.logger?.debug('Syncing team: ' + JSON.stringify(record));

    const team = record.record.data as TeamRow;
    const source: Source =
      ctx.config.source_specific_configs.faros_org_import?.source ?? {};

    // Skip team if teamId is DEFAULT_ROOT_TEAM_ID
    if (team.teamId === DEFAULT_ROOT_TEAM_ID) {
      ctx.logger?.warn(
        `Skipping team with id ${DEFAULT_ROOT_TEAM_ID} as it is reserved.`
      );
      return [];
    }

    // Missing teamName
    if (!team.teamName) {
      this.teamsMissingTeamName.push(team.teamId);
    }

    // Missing teamLeadId
    if (!team.teamLeadId) {
      this.teamsMissingTeamLeadId.push(team.teamId);
    }

    // Missing parentTeamId
    if (!team.parentTeamId && team.teamId !== DEFAULT_ROOT_TEAM_ID) {
      this.teamsMissingParentTeamId.push(team.teamId);
      this.teamsToSync.push({...team, parentTeamId: DEFAULT_ROOT_TEAM_ID});
      this.teamToParentMapping.set(team.teamId, DEFAULT_ROOT_TEAM_ID);
      return [];
    } else {
      this.teamToParentMapping.set(team.teamId, team.parentTeamId);
    }

    // Collect all survey teams
    if (team.surveyTeamId && source.survey) {
      if (!this.surveyTeamMap.has(team.surveyTeamId)) {
        this.surveyTeamMap.set(team.surveyTeamId, []);
      }
      this.surveyTeamMap.get(team.surveyTeamId).push(team.teamId);
    }

    this.teamsToSync.push(team);
    return [];
  }

  async onProcessingComplete(
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    const models = [];
    const syncedTeams = new Set<string>();

    const source: Source =
      ctx.config.source_specific_configs.faros_org_import?.source ?? {};

    // Log aggregated warnings
    const teamsWithCycle = this.checkTeamsCycle();
    if (this.teamsMissingTeamName.length) {
      ctx.logger?.warn(
        `The following teams are missing teamName: ${this.teamsMissingTeamName.join(
          ', '
        )}`
      );
    }
    if (this.teamsMissingParentTeamId.length) {
      ctx.logger?.warn(
        `The following teams are missing parentTeamId: ${this.teamsMissingParentTeamId.join(
          ', '
        )}`
      );
    }
    if (this.teamsMissingTeamLeadId.length) {
      ctx.logger?.warn(
        `The following teams are missing teamLeadId: ${this.teamsMissingTeamLeadId.join(
          ', '
        )}`
      );
    }
    if (teamsWithCycle.length) {
      ctx.logger?.warn(
        `The following teams have a cycle in their parent-child relationship: ${Array.from(
          teamsWithCycle
        ).join(', ')}`
      );
    }

    // Sync teams
    for (const team of this.teamsToSync) {
      if (syncedTeams.has(team.teamId)) {
        ctx.logger?.warn(`Duplicate teamId: ${team.teamId}`);
        continue;
      }

      models.push({
        model: 'org_Team',
        record: {
          uid: team.teamId,
          name: team.teamName,
          parentTeamId: team.parentTeamId,
          description: team.teamDescription,
          leader: lift(team.teamLeadId, (leadId) => ({uid: leadId})),
        },
      });
      syncedTeams.add(team.teamId);

      // Sync team communication channels
      if (team.communicationChannel_Discord) {
        models.push(
          this.getTeamCommunicationChannel(
            team.teamId,
            'Discord',
            team.communicationChannel_Discord
          )
        );
      }
      if (team.communicationChannel_Email) {
        models.push(
          this.getTeamCommunicationChannel(
            team.teamId,
            'Email',
            team.communicationChannel_Email
          )
        );
      }
      if (team.communicationChannel_Slack) {
        models.push(
          this.getTeamCommunicationChannel(
            team.teamId,
            'Slack',
            team.communicationChannel_Slack
          )
        );
      }
      if (team.communicationChannel_Teams) {
        models.push(
          this.getTeamCommunicationChannel(
            team.teamId,
            'Teams',
            team.communicationChannel_Teams
          )
        );
      }
    }

    // Sync survey teams
    for (const [surveyTeamId, teams] of this.surveyTeamMap.entries()) {
      if (teams.length > 1) {
        ctx.logger.warn(
          `Survey team (${surveyTeamId}) was assigned to more than one team: ${teams.join(', ')}`
        );
      }
      // Always write first association even if duplicate teams detected
      models.push({
        model: 'survey_OrgTeam',
        record: {
          surveyTeam: {uid: surveyTeamId, source: source.survey},
          orgTeam: {uid: teams[0]},
        },
      });
    }

    // Clean up ownership for teams that no longer exist
    const teamsIter: AsyncIterable<TeamOwnersip> = ctx.farosClient.nodeIterable(
      ctx.graph,
      TEAM_OWNERSHIP_QUERY,
      undefined,
      undefined,
      new Map([['origin', ctx.config.origin]])
    );

    for await (const team of teamsIter) {
      if (syncedTeams.has(team.uid)) {
        continue;
      }
      for (const {application} of team.applications) {
        models.push({
          model: 'org_ApplicationOwnership__Deletion',
          record: {
            where: {application, team},
          },
        });
      }
      for (const {board} of team.boards) {
        models.push({
          model: 'org_BoardOwnership__Deletion',
          record: {
            where: {board, team},
          },
        });
      }
      for (const {project} of team.projects) {
        models.push({
          model: 'org_ProjectOwnership__Deletion',
          record: {
            where: {project, team},
          },
        });
      }
      for (const {repository} of team.repositories) {
        models.push({
          model: 'org_RepositoryOwnership__Deletion',
          record: {
            where: {repository, team},
          },
        });
      }
      for (const {pipeline} of team.pipelines) {
        models.push({
          model: 'org_PipelineOwnership_Deletion',
          record: {
            where: {pipeline, team},
          },
        });
      }

      ctx.logger?.info(
        `Deleted ownership for ${team.applications.length} apps, ` +
          `${team.boards.length} boards, ` +
          `${team.projects.length} projects, ` +
          `${team.repositories.length} repos, ` +
          `${team.pipelines.length} pipelines ` +
          `for team ${team.name} (uid: ${team.uid})`
      );
    }

    return models;
  }

  private getTeamCommunicationChannel(
    teamId: string,
    type: 'Email' | 'Slack' | 'Teams' | 'Discord',
    channel?: string
  ): DestinationRecord {
    return {
      model: 'org_CommunicationChannel',
      record: {
        uid: `${type}__${channel}`,
        team: {uid: teamId},
        type,
        name: `${teamId} : ${type} communication channel`,
        value: channel,
      },
    };
  }

  private checkTeamsCycle(): string[] {
    const teamsWithCycle = new Set<string>();
    for (const teamId of this.teamToParentMapping.keys()) {
      let team = teamId;
      if (team === DEFAULT_ROOT_TEAM_ID) {
        continue;
      }
      let parent;
      while (parent !== DEFAULT_ROOT_TEAM_ID) {
        parent = this.teamToParentMapping.get(team);
        if (!parent) {
          break;
        }
        if (parent === teamId) {
          teamsWithCycle.add(teamId);
          break;
        }
        team = parent;
      }
    }
    return Array.from(teamsWithCycle);
  }
}
