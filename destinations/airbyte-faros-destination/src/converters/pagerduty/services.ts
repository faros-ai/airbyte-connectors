import {AirbyteRecord} from 'faros-airbyte-cdk';
import {paginatedQueryV2} from 'faros-js-client';

import {DestinationModel, DestinationRecord, StreamContext} from '../converter';
import {PagerDutyConverter, PagerdutyObject} from './common';

interface Service extends PagerdutyObject {
  readonly teams: PagerdutyObject[];
}

interface OrgTeam {
  uid: string;
  name: string;
}

export class Services extends PagerDutyConverter {
  readonly destinationModels: ReadonlyArray<DestinationModel> = [
    'compute_Application',
    'org_ApplicationOwnership',
  ];

  private orgTeams: OrgTeam[];
  private seenComputeApps: Set<string> = new Set();

  async convert(
    record: AirbyteRecord,
    ctx: StreamContext
  ): Promise<ReadonlyArray<DestinationRecord>> {
    if (!this.pagerdutyConfig(ctx).associate_applications_to_teams) {
      return [];
    }
    if (!this.orgTeams) {
      this.orgTeams = await this.fetchOrgTeams(ctx);
    }
    const service = record.record.data as Service;
    const teams = service.teams ?? [];
    // a compute_Application can only be owned by 1 org_Team
    if (teams.length !== 1) {
      return [];
    }
    const serviceTeamName = teams[0].summary?.toLowerCase();
    if (!serviceTeamName) {
      return [];
    }
    // Pagerduty converts '&' to 'and' in team names
    const altServiceTeamName = serviceTeamName.replace(/ and /g, ' & ');
    const orgTeam = this.orgTeams.find((ot) => {
      return ot.name === serviceTeamName || ot.name === altServiceTeamName;
    });
    if (!orgTeam) {
      return [];
    }

    const application = this.computeApplication(ctx, service.summary);
    if (this.seenComputeApps.has(application.uid)) {
      return [];
    }
    this.seenComputeApps.add(application.uid);

    const results: DestinationRecord[] = [];

    // Delete existing association
    results.push({
      model: 'org_ApplicationOwnership__Deletion',
      record: {
        where: {
          application,
        },
      },
    });
    results.push(
      {model: 'compute_Application', record: application},
      {
        model: 'org_ApplicationOwnership',
        record: {team: {uid: orgTeam.uid}, application},
      }
    );

    return results;
  }

  private async fetchOrgTeams(ctx: StreamContext): Promise<OrgTeam[]> {
    const orgTeams = [];
    if (!ctx.farosClient || !ctx.graph) {
      return orgTeams;
    }
    const query = `
    {
      org_Team {
        uid
        name
      }
    }`;
    const iter = ctx.farosClient.nodeIterable(
      ctx.graph,
      query,
      100,
      paginatedQueryV2
    );
    for await (const node of iter) {
      orgTeams.push({uid: node.uid, name: node.name?.toLowerCase()});
    }
    return orgTeams;
  }
}
