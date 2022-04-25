export interface ProjectResponse {
  value: Project[];
}

export interface Project {
  readonly id: number;
  readonly SpaceId: string;
  readonly VariableSetId: string;
  readonly DeploymentProcessId: string;
  readonly ClonedFromProjectId: string;
  readonly DiscreteChannelRelease: boolean;
  readonly IncludedLibraryVariableSetIds: object;
  readonly DefaultToSkipIfAlreadyInstalled: boolean;
  readonly TenantedDeploymentMode: string;
  readonly DefaultGuidedFailureMode: string;
  readonly VersioningStrategy: object;
  readonly DonorPackage: string;
  readonly DonorPackageStepId: string;
  readonly ReleaseCreationStrategy: object;
  readonly ReleaseCreationPackage: string;
  readonly ReleaseCreationPackageStepId: string;
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
