export interface Work extends BaseObject {
  attributes: Attribute;
  Id: string;
  Name: string;
  agf__Description__c: string | null;
  agf__Type__c: WorkType;
  agf__Priority__c: WorkPriority | null;
  agf__Status__c: WorkStatus;
  agf__Story_Points__c: number | null;
  CreatedDate: string;
  LastModifiedDate: string;
  agf__Parent_ID__c: string | null;
  CreatedById: string | null;
  agf__Epic__c: string | null;
  agf__Sprint__c: string | null;
  CreatedBy: User | null;
  agf__Epic__r: Epic | null;
  agf__Sprint__r: Sprint | null;
}

interface Attribute {
  type: string;
  /** URL path - doesn't include domain */
  url: string;
}

interface BaseObject {
  /** Domain url - doesn't include path */
  baseUrl: string;
}

interface Epic {
  Id: string;
  Name: string;
  agf__Description__c: string | null;
  agf__Health__c: EpicHealth;
  agf__Project__r: Project;
}

interface Project {
  Id: string;
  Name: string;
  agf__Project_Management_Notes__c: string;
  agf__Project_Summary__c: string;
  CreatedDate: string;
  LastModifiedDate: string;
}

interface Sprint {
  Id: string;
  Name: string;
  CreatedDate: string;
  LastModifiedDate: string;
  agf__Retrospective__c: string;
  agf__Committed_Points__c: number | null;
  agf__Committed_Story_Points_Completed__c: number;
  agf__Completed_Story_Points__c: number | null;
  agf__Completion_Committed_Story_Points__c: number;
  agf__Completion_Story_Points__c: number;
  agf__Days_Remaining__c: SpringDaysRemaining;
  agf__Start_Date__c: string;
  agf__End_Date__c: string;
}

interface User {
  Id: string;
  Email: string;
  Name: string;
  Username: string;
}

enum EpicHealth {
  On_Track = 'On Track',
  Watch = 'Watch',
  Blocked = 'Blocked',
  Not_Started = 'Not Started',
  On_Hold = 'On Hold',
  Completed = 'Completed',
  Canceled = 'Canceled',
  Green = 'Green',
  Yellow = 'Yellow',
  Red = 'Red',
}

enum SpringDaysRemaining {
  NOT_STARTED = 'NOT STARTED',
  CLOSED = 'CLOSED',
}

enum WorkType {
  Bug = 'Bug',
  Gack = 'Gack',
  Help = 'Help',
  Integrate = 'Integrate',
  Test_Change = 'Test Change',
  Test_Case = 'Test Case',
  Test_Failure = 'Test Failure',
  Test_Tool = 'Test Tool',
  Skunkforce = 'Skunkforce',
  Bug_List = 'Bug List',
  Translation = 'Translation',
  Non_Deterministic_Test = 'Non Deterministic Test',
}

enum WorkPriority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4',
}

enum WorkStatus {
  New = 'New',
  Acknowledged = 'Acknowledged',
  Triaged = 'Triaged',
  In_Progress = 'In Progress',
  Investigating = 'Investigating',
  Ready_for_Review = 'Ready for Review',
  Fixed = 'Fixed',
  QA_In_Progress = 'QA In Progress',
  Closed = 'Closed',
  Closed_Defunct = 'Closed - Defunct',
  Closed_Duplicate = 'Closed - Duplicate',
  Closed_Eng_Internal = 'Closed - Eng Internal',
  Closed_Known_Bug_Exists = 'Closed - Known Bug Exists',
  Closed_New_Bug_Logged = 'Closed - New Bug Logged',
  Closed_LAP_Request_Approved = 'Closed - LAP Request Approved',
  Closed_LAP_Request_Denied = 'Closed - LAP Request Denied',
  Closed_Resolved_With_Internal_Tools = 'Closed - Resolved With Internal Tools',
  Closed_Resolved_Without_Code_Change = 'Closed - Resolved Without Code Change',
  Closed_No_Fix_Working_as_Designed = 'Closed - No Fix - Working as Designed',
  Closed_No_Fix_Feature_Request = 'Closed - No Fix - Feature Request',
  Closed_No_Fix_Will_Not_Fix = 'Closed - No Fix - Will Not Fix',
  Waiting = 'Waiting',
  Integrate = 'Integrate',
  Pending_Release = 'Pending Release',
  Duplicate = 'Duplicate',
  Inactive = 'Inactive',
  More_Info_Reqd_from_Support = 'More Info Reqd from Support',
  Never = 'Never',
  Not_a_bug = 'Not a bug',
  Not_Reproducible = 'Not Reproducible',
  Rejected = 'Rejected',
  Completed = 'Completed',
  Deferred = 'Deferred',
  Eng_Internal = 'Eng Internal',
}
