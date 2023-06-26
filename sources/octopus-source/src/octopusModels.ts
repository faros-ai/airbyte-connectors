/**
 * These are copies of the models exposed by the octopus api client.
 */

export interface ResourceCollection<T> {
  Items: T[];
  ItemsPerPage: number;
  ItemType: string;
  LastPageNumber: number;
  Links: LinksCollection<ResourceCollectionLinks>;
  NumberOfPages: number;
  TotalResults: number;
}

export type ListArgs = {
  skip?: number;
  take?: number;
};

interface ResourceCollectionLinks {
  Self: string;
  Template: string;
  'Page.All': string;
  'Page.Current': string;
  'Page.Last': string;
}

type LinksCollection<T> = T & {
  [Name: string]: string;
};

interface Resource {
  Id: string;
}

interface NamedResource extends Resource {
  Name: string;
}

interface SpaceScopedResource extends Resource {
  SpaceId: string;
}

export interface Space extends NamedResource {
  Slug: string;
  Description?: string;
  IsDefault: boolean;
  SpaceManagersTeamMembers: string[];
  SpaceManagersTeams: string[];
  TaskQueueStopped: boolean;
}

export interface Project extends SpaceScopedResource, NamedResource {
  VariableSetId: string;
  DeploymentProcessId: string;
  DiscreteChannelRelease: boolean;
  IncludedLibraryVariableSetIds: string[];
  TenantedDeploymentMode: TenantedDeploymentMode;
  ReleaseCreationStrategy: ReleaseCreationStrategy;
  Templates: ActionTemplateParameter[];
  AutoDeployReleaseOverrides: any[];
  LifecycleId: string;
  AutoCreateRelease: boolean;
  ClonedFromProjectId: string;
  ExtensionSettings: ExtensionSettingsValues[];
  IsVersionControlled: boolean;
  PersistenceSettings:
    | VersionControlledPersistenceSettings
    | DatabasePersistenceSettings;
  Slug: string;
  ProjectGroupId: string;
  Description: string;
  IsDisabled: boolean;
}

declare enum TenantedDeploymentMode {
  Untenanted = 'Untenanted',
  TenantedOrUntenanted = 'TenantedOrUntenanted',
  Tenanted = 'Tenanted',
}

interface ReleaseCreationStrategy {
  ReleaseCreationPackage: DeploymentActionPackage;
  ChannelId?: string;
  ReleaseCreationPackageStepId?: string;
}

interface DeploymentActionPackage {
  DeploymentAction: string;
  PackageReference?: string;
}

export interface ActionTemplateParameter extends Resource {
  AllowClear?: boolean;
  DefaultValue?: PropertyValue;
  DisplaySettings: ActionTemplateParameterDisplaySettings;
  HelpText: string;
  Label: string;
  Name: string;
}

interface ActionTemplateParameterDisplaySettings {
  'Octopus.ControlType'?: ControlType;
  'Octopus.SelectOptions'?: string;
}

declare enum ControlType {
  AmazonWebServicesAccount = 'AmazonWebServicesAccount',
  AzureAccount = 'AzureAccount',
  Certificate = 'Certificate',
  Checkbox = 'Checkbox',
  Custom = 'Custom',
  GoogleCloudAccount = 'GoogleCloudAccount',
  MultiLineText = 'MultiLineText',
  Package = 'Package',
  Select = 'Select',
  Sensitive = 'Sensitive',
  SingleLineText = 'SingleLineText',
  StepName = 'StepName',
  WorkerPool = 'WorkerPool',
}

interface VersionControlledPersistenceSettings {
  Type: PersistenceSettingsType.VersionControlled;
  Credentials: AnonymousVcsCredentials | UsernamePasswordVcsCredentials;
  Url: string;
  DefaultBranch: string;
  BasePath: string;
}

export declare enum PersistenceSettingsType {
  VersionControlled = 'VersionControlled',
  Database = 'Database',
}

export interface UsernamePasswordVcsCredentials {
  Type: AuthenticationType.UsernamePassword;
  Username: string;
  Password: SensitiveValue;
}
export interface AnonymousVcsCredentials {
  Type: AuthenticationType.Anonymous;
}

export declare enum AuthenticationType {
  Anonymous = 'Anonymous',
  UsernamePassword = 'UsernamePassword',
}

interface DatabasePersistenceSettings {
  Type: PersistenceSettingsType.Database;
}

interface Execution extends SpaceScopedResource {
  Name: string;
  Comments: string;
  Created: string;
  EnvironmentId: string;
  ExcludedMachineIds: string[];
  ForcePackageDownload: boolean;
  FormValues: Record<string, unknown>;
  ManifestVariableSetId: string;
  ProjectId: string;
  QueueTime?: Date;
  QueueTimeExpiry?: Date;
  SkipActions: string[];
  SpecificMachineIds: string[];
  TaskId: string;
  TenantId?: string;
  UseGuidedFailure: boolean;
}

export interface Deployment extends Execution {
  ReleaseId: string;
  Changes: ReleaseChanges[];
  ChangesMarkdown: string;
  DeploymentProcessId: string;
  ChannelId: string;
  ForcePackageRedeployment: boolean;
}

export interface DeploymentStep extends Resource {
  Id: string;
  Name: string;
  Properties: ActionProperties;
  Condition: RunCondition;
  StartTrigger: StartTrigger;
  PackageRequirement: PackageRequirement;
  Actions: DeploymentAction[];
}

declare enum StartTrigger {
  StartWithPrevious = 'StartWithPrevious',
  StartAfterPrevious = 'StartAfterPrevious',
}
declare enum RunCondition {
  Success = 'Success',
  Failure = 'Failure',
  Always = 'Always',
  Variable = 'Variable',
}
declare enum PackageRequirement {
  LetOctopusDecide = 'LetOctopusDecide',
  BeforePackageAcquisition = 'BeforePackageAcquisition',
  AfterPackageAcquisition = 'AfterPackageAcquisition',
}

export interface DeploymentAction extends Resource {
  ActionType: string;
  CanBeUsedForProjectVersioning: boolean;
  Channels: string[];
  Condition?: RunConditionForAction;
  Container: DeploymentActionContainer;
  Environments: string[];
  ExcludedEnvironments: string[];
  Id: string;
  IsDisabled: boolean;
  IsRequired: boolean;
  Name: string;
  Notes: string | null;
  Packages: PackageReference[];
  Properties: ActionProperties;
  StepPackageVersion?: string;
  TenantTags: string[];
  Inputs?: ActionInputs;
  WorkerPoolId: string | null;
  WorkerPoolVariable: string | null;
}

declare enum RunConditionForAction {
  Success = 'Success',
  Variable = 'Variable',
}

interface DeploymentActionContainer {
  FeedId: string | null;
  Image: string | null;
}

interface PackageReference<T = PackageReferenceProperties> {
  Name?: string;
  PackageId: string;
  FeedId: string;
  AcquisitionLocation: string;
  Properties: T;
  Id: string;
}
type PackageReferenceProperties = Record<string, string>;

type ActionInputs = object | undefined;

interface ReleaseChanges {
  Version: string;
  ReleaseNotes: string;
  WorkItems: WorkItemLink[];
  Commits: CommitDetail[];
  BuildInformation: ReleasePackageVersionBuildInformation[];
}

interface ReleasePackageVersionBuildInformation {
  PackageId: string;
  Version: string;
  BuildNumber: string;
  BuildUrl: string;
  VcsType: string;
  VcsRoot: string;
  VcsCommitNumber: string;
}

interface CommitDetail {
  Id: string;
  Comment: string;
  LinkUrl: string;
}
interface WorkItemLink {
  Id: string;
  Description: string;
  LinkUrl: string;
}

export interface ServerTask extends NamedResource {
  Description: string;
  State: TaskState;
  Completed?: string;
  QueueTime?: string;
  QueueTimeExpiry?: string;
  StartTime?: string | null;
  LastUpdatedTime?: string;
  CompletedTime?: string | null;
  ServerNode?: string;
  Duration?: string;
  ErrorMessage?: string;
  HasBeenPickedUpByProcessor?: boolean;
  IsCompleted: boolean;
  FinishedSuccessfully?: boolean;
  HasPendingInterruptions: boolean;
  CanRerun?: boolean;
  HasWarningsOrErrors: boolean;
}

export declare enum TaskState {
  Canceled = 'Canceled',
  Cancelling = 'Cancelling',
  Executing = 'Executing',
  Failed = 'Failed',
  Queued = 'Queued',
  Success = 'Success',
  TimedOut = 'TimedOut',
}

export interface DeploymentEnvironment
  extends SpaceScopedResource,
    NamedResource {
  Description?: string;
  AllowDynamicInfrastructure: boolean;
  ExtensionSettings: ExtensionSettingsValues[];
  SortOrder: number;
  UseGuidedFailure: boolean;
}

interface ExtensionSettingsValues {
  ExtensionId: string;
  Values: Record<string, any>;
}

export interface DeploymentProcess extends SpaceScopedResource {
  ProjectId: string;
  Steps: DeploymentStep[];
  Version: number;
  LastSnapshotId?: string;
}

export type ActionProperties = Record<string, PropertyValue>;

export type PropertyValue = string | SensitiveValue | null;

export interface SensitiveValue {
  HasValue: boolean;
  Hint?: string;
  NewValue?: string;
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
  readonly BuildInformation: object;
  readonly Assembled: string;
  readonly LibraryVariableSetSnapshotIds: object;
  readonly SelectedPackages: object;
  readonly ProjectVariableSetSnapshotId: object;
  readonly VersionControlReference: object;
  readonly LastModifiedBy: object;
  readonly LastModifiedOn: object;
  readonly Link: object;
}

export interface VariableScope {
  // Note: For all, length of list is almost always 1
  Action?: string[];
  Environment?: string[];
  Role?: string[];
  TargetRole?: string[];
  Project?: string[];
  // Note length of list is usually 1 with a string in bool format like "True"
  User?: string[];
  Machine?: string[];
  // Note length of list is also usually 1 with a string in bool format like "True"
  Private?: string[];
}

export interface VariablePrompt {
  Label: string;
  Description: string;
  Required: boolean;
  DisplaySettings: any;
}

export interface DeploymentVariable {
  Id: string | null;
  Name: string | null;
  Value: string | null;
  Description: string | null;
  Scope: VariableScope;
  IsEditable: boolean;
  Prompt: VariablePrompt | null;
  Type: string | null;
  IsSensitive: boolean;
}

export interface VariableSetResponse {
  Variables: DeploymentVariable[];
}
