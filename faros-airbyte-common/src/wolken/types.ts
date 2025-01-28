export interface User {
  readonly userId: number;
  readonly userPsNo: string;
  readonly userFname: string;
  readonly userLname: string;
  readonly userEmail: string;
  readonly userPhno: string;
  readonly userMobno: string;
  readonly activeUser: boolean;
  readonly hireDate: string;
}

export interface CIRequest {
  pkey: number;
  ciId: number;
  ciName: string;
  ciTypeId: number;
  ciTypeName: string;
}

export interface Incident {
  ticketId: number;
  ticketFormattedId: string;
  originId: number;
  originName: string;
  subject: string;
  createdTime: string;
  requesterId: number;
  requesterName: string;
  creatorId: number;
  creatorName: string;
  unitId: number;
  unitName: string;
  categoryId: number;
  categoryName: string;
  subCategoryId: number;
  subCategoryName: string;
  itemId: number;
  itemName: string;
  teamId: number;
  teamName: string;
  priorityId: number;
  priorityName: string;
  impactId: number;
  impactName: string;
  urgencyId: number;
  urgencyName: string;
  assignedUserId: string;
  assignedUserName: string;
  assignedUserPsNo: string;
  updatedTimestamp: string;
  statusName: string;
  subStatusName: string;
  statusId: number;
  subStatusId: number;
  lastUpdatedByUser: string;
  lastUpdatedByUserId: number;
  plannedStartDate: string;
  plannedEndDate: string;
  closedByUserID: string;
  closureTimeStamp: string;
  resolvedByUserID: string;
  resolvedByUserEmail: string;
  resolvedByUserName: string;
  resolutionTimeStamp: string;
  description: string;
  flexFields: FlexField[];
  ciRequestList: CIRequest[];
}

export interface FlexField {
  flexId: number;
  flexName: string;
  flexValue: string;
}

export interface Urgency {
  urgencyId: number;
}

export interface ConfigurationItem {
  ciId: number;
  ciName: string;
  ciDesc: string;
  ciNotes: string;
  ciStatusId: number;
  ciOwnerId: string;
  ciNumber: string;
  ciSerialNumber: string;
  ciTypeId: number;
  ciTypeName: string;
  ciLocationId: number;
  ciAssetTag: string;
  ciCostCenterId: string;
  ciPoNumber: string;
  ciCost: string;
  dateofpurchase: string;
  dateofuse: string;
  createdById: number;
  createddate: string;
  updatedbyId: number;
  updatedDate: string;
  ciSourceid: number;
  ciSupplier: string;
  ciIpAddress: string;
  ciOS: string;
  ciMemory: string;
  ciStorage: string;
  hostName: string;
  prodGroup: string;
  deviceClass: string;
  deviceModel: string;
  ciArch: string;
  ciModel: string;
  ciSubTypeId: number;
  ciSubTypeName: string;
  ciCPU: string;
  ciRAM: string;
  ciHDD: string;
  amcRequired: boolean;
  ciClassificationId: string;
  ciSecondaryOwnerid: string;
  ciAssignmentTeamId: number;
  ciApprovalGroupId: string;
  warrantyStartdate: string;
  warrantyEnddate: string;
  cimanufacture: string;
  taskTeam: string;
  ciStatusName: string;
  flexFields: FlexField[];
  urgency: Urgency;
}
