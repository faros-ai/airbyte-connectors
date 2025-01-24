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
