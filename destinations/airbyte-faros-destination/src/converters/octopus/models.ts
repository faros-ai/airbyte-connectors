export interface Project {
  readonly Id: string;
  readonly SpaceId: string;
  readonly VariableSetId: string;
  readonly DeploymentProcessId: string;
  readonly ClonedFromProjectId: string;
  readonly DiscreteChannelRelease: boolean;
  readonly IncludedLibraryVariableSetIds: string;
  readonly DefaultToSkipIfAlreadyInstalled: boolean;
  readonly TenantedDeploymentMode: string;
  readonly DefaultGuidedFailureMode: string;
  readonly VersioningStrategy: object;
  readonly ReleaseCreationStrategy: object;
  readonly Name: string;
  readonly Slug: string;
  readonly Description: string;
  readonly IsDisabled: boolean;
  readonly ProjectGroupId: string;
  readonly LifecycleId: string;
  readonly AutoCreateRelease: boolean;
  readonly IsVersionControlled: boolean;
  readonly PersistenceSettings: object;
  readonly ProjectConnectivityPolicy: object;
  readonly Link: object;
}

export interface Channel {
  readonly Id: string;
  readonly Name: string;
  readonly Description: string;
  readonly ProjectId: string;
  readonly LifecycleId: string;
  readonly Rules: string;
  readonly TenantTags: string;
  readonly SpaceId: string;
  readonly Link: object;
  readonly IsDefault: boolean;
}

export interface Release {
  readonly Id: string;
  readonly ProjectId: string;
  readonly SpaceId: string;
  readonly ChannelId: string;
  readonly Version: string;
  readonly ReleaseNotes: string;
  readonly ProjectDeploymentProcessSnapshotId: string;
  readonly IgnoreChannelRules: boolean;
  readonly BuildInformation: string;
  readonly Assembled: string;
  readonly LibraryVariableSetSnapshotIds: string;
  readonly SelectedPackages: string;
  readonly ProjectVariableSetSnapshotId: string;
  readonly VersionControlReference: string;
  readonly Link: object;
}

export interface Deployment {
  readonly Changes: string;
  readonly ChangesMarkdown: string;
  readonly ChannelId: string;
  readonly Comments: string;
  readonly Created: string;
  readonly DeployedBy: string;
  readonly DeployedById: string;
  readonly DeployedToMachineIds: string;
  readonly DeploymentProcessId: string;
  readonly EnvironmentId: string;
  readonly ExcludedMachineIds: string;
  readonly FailureEncountered: string;
  readonly ForcePackageRedeployment: boolean;
  readonly FormValues: object;
  readonly Id: string;
  readonly LastModifiedOn: string;
}
