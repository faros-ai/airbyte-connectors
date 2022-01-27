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

  /** Additional fields: */
  OwnerId: string | null;
  IsDeleted: boolean;
  RecordTypeId: string | null;
  LastModifiedById: string | null;
  SystemModstamp: string | null;
  LastActivityDate: string | null;
  LastViewedDate: string | null;
  LastReferencedDate: string | null;
  agf__Additional_Details__c: string | null;
  agf__Age_With_Scrum_Team_When_Closed__c: number;
  agf__Age_With_Scrum_Team__c: number;
  agf__Age__c: number;
  agf__Apex_Hammer_Compile_Failure__c: boolean;
  agf__Assigned_On__c: string | null;
  agf__Assignee__c: string | null;
  agf__Assignees__c: string | null;
  agf__Attributes__c: string | null;
  agf__Auto_Build__c: string | null;
  agf__Backburner_Rank__c: string | null;
  agf__Board_Column_Rank__c: string | null;
  agf__Board_Column__c: string | null;
  agf__Branch__c: string | null;
  agf__Budget_ID__c: string | null;
  agf__Bug_Number__c: string | null;
  agf__CS_Contact__c: string | null;
  agf__Capex_Enabled__c: boolean;
  agf__Catchup_Factor__c: string | null;
  agf__Child_ID__c: string | null;
  agf__Closed_By__c: string | null;
  agf__Closed_On__c: string | null;
  agf__Closed__c: number;
  agf__Cloud__c: string | null;
  agf__Color__c: string | null;
  agf__Column_Rank__c: string | null;
  agf__Column__c: string | null;
  agf__Comment_Copy__c: string | null;
  agf__Complete_By__c: string | null;
  agf__Created_By_import__c: string | null;
  agf__Created_On_Date__c: string | null;
  agf__Created_On_import__c: string | null;
  agf__Critical_CRM_Feature__c: boolean;
  agf__Customer_Impact__c: string | null;
  agf__Customer__c: string | null;
  agf__Data_Silo_Test_Affected__c: boolean;
  agf__Deal_at_Risk__c: null;
  agf__Dependencies__c: null;
  agf__Dependents__c: null;
  agf__Detailed__c: boolean;
  agf__Details__c: null;
  agf__Details_and_Steps_to_Reproduce__c: null;
  agf__Due_Date__c: null;
  agf__Email2GUS_Addresses__c: null;
  agf__Email_On_Save_Copy__c: boolean;
  agf__Email_On_Save__c: boolean;
  agf__Email_Subscription_ID__c: string | null;
  agf__Email_Subscription_Queue__c: string | null;
  agf__Encoded_Recipients_Txt_Area__c: string | null;
  agf__Environment__c: string | null;
  agf__Epic_Name__c: string | null;
  agf__Epic_Rank__c: string | null;
  agf__Escalation_Point__c: string | null;
  agf__Estimated_Financial_Impact__c: string | null;
  agf__Executive_Involved__c: boolean;
  agf__External_ID__c: string | null;
  agf__Feature_Rank__c: string | null;
  agf__Feedback__c: string | null;
  agf__Found_In_Build_Copy__c: string | null;
  agf__Found_In_Build_Name__c: string | null;
  agf__Found_in_Build__c: string | null;
  agf__Frequency_Name__c: string | null;
  agf__Frequency__c: string | null;
  agf__Goal__c: string | null;
  agf__Has_Story_Points__c: string | null;
  agf__Help_Status__c: string | null;
  agf__Highlight__c: boolean;
  agf__Impact_Name__c: string | null;
  agf__Impact__c: string | null;
  agf__Is_Ignorable__c: boolean;
  agf__Is_Template__c: boolean;
  agf__Known_Issue_ID__c: string | null;
  agf__Known_Issue_Link__c: string | null;
  agf__Known_Issue_Num_Reporting_Customers__c: string | null;
  agf__Last_Modified_By_Copy__c: string | null;
  agf__Last_Modified_By__c: string | null;
  agf__Last_Updated_By__c: string | null;
  agf__Log_Bug_From_Template__c: string | null;
  agf__Major_Func_Area__c: string | null;
  agf__Major_Release__c: string | null;
  agf__Minor_Func_Area__c: string | null;
  agf__Mobile_Device_OS__c: string | null;
  agf__Mobile_Device__c: string | null;
  agf__Mobile_Network__c: string | null;
  agf__Modules__c: string | null;
  agf__Num_Of_Prod_Occ__c: string | null;
  agf__Number_of_Cases__c: number;
  agf__Number_of_Change_Lists__c: number;
  agf__Number_of_Orgs_affected__c: null;
  agf__Number_of_Tests_Classes_affected__c: string | null;
  agf__Origin__c: string | null;
  agf__Other_Recipients__c: string | null;
  agf__Out_of_SLA__c: boolean;
  agf__Perforce_Status__c: string | null;
  agf__Preserve_Formatting_Copy__c: boolean;
  agf__Preserve_Formatting__c: boolean;
  agf__Previous_Comments__c: string | null;
  agf__Priority_Default__c: string | null;
  agf__Priority_Mapping_Copy__c: string | null;
  agf__Priority_Mapping__c: string | null;
  agf__Priority_Override_Explanation_Copy__c: string | null;
  agf__Priority_Override_Explanation__c: string | null;
  agf__Priority_Rank__c: string | null;
  agf__Product_Area__c: string | null;
  agf__Product_Child__c: string | null;
  agf__Product_Owner__c: string | null;
  agf__Product_Tag_Name__c: string | null;
  agf__Product_Tag__c: string | null;
  agf__QA_Engineer__c: string | null;
  agf__Readme_Notes__c: string | null;
  agf__Record_Type__c: string | null;
  agf__Red_Account__c: boolean;
  agf__Regressed__c: boolean;
  agf__Related_URL_Link__c: string | null;
  agf__Related_URL__c: string | null;
  agf__Related_Work__c: string | null;
  agf__Release__c: string | null;
  agf__Request_RD_Mgr_Review__c: boolean;
  agf__Resolution__c: string | null;
  agf__Resolved_By__c: string | null;
  agf__Resolved_On__c: string | null;
  agf__Resolved__c: number;
  agf__Root_Cause_Analysis_2__c: string | null;
  agf__S1_App_Build_Number__c: string | null;
  agf__Scheduled_Build_Copy__c: string | null;
  agf__Scheduled_Build_Name__c: string | null;
  agf__Scheduled_Build_Rank__c: string | null;
  agf__Scheduled_Build__c: string | null;
  agf__Scheduled_On__c: string | null;
  agf__Schema__c: boolean;
  agf__Scrum_Team_Last_Modified__c: string | null;
  agf__Scrum_Team_Name__c: string | null;
  agf__Scrum_Team__c: string | null;
  agf__Scrumforce_ID__c: string | null;
  agf__Security__c: boolean;
  agf__Senior_Management_POC__c: string | null;
  agf__Severity_Copy__c: string | null;
  agf__Severity_Level__c: string | null;
  agf__Solution_Overview__c: string | null;
  agf__Sprint_Name__c: string | null;
  agf__Sprint_Rank__c: string | null;
  agf__Sprint_Timeframe__c: string | null;
  agf__Story_Status__c: string | null;
  agf__Subject__c: string | null;
  agf__Subscribe_to_Work__c: boolean;
  agf__System_Test_Engineer__c: string | null;
  agf__Target_Build__c: string | null;
  agf__Tech_Writer__c: string | null;
  agf__Template_Description__c: string | null;
  agf__Template_Name__c: string | null;
  agf__Test_Failure_Status__c: string | null;
  agf__Test_Plan__c: string | null;
  agf__Theme_Rank__c: string | null;
  agf__Theme__c: string | null;
  agf__Total_Age_When_Closed__c: number;
  agf__Trust_Rank__c: string | null;
  agf__Type_Value__c: number;
  agf__UE_Engineer__c: string | null;
  agf__Use_Prioritizer__c: boolean;
  agf__User_Profile_of_the_Creator__c: string | null;
  agf__User_Type__c: string | null;
  agf__Was_Ever_Returned_to_Support__c: boolean;
  agf__WorkId_and_Subject__c: string | null;
  agf__ftest__c: string | null;
  agf__of_Test_Failures__c: string | null;
  agf__visual_link_num_of_Test_Failures__c: string | null;
  agf__Completed_Hours__c: number;
  agf__Number_of_SLA_Violations__c: number;
}

interface Attribute {
  type: string;
  /** URL path - without domain */
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

export enum EpicHealth {
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

export enum SpringDaysRemaining {
  NOT_STARTED = 'NOT STARTED',
  CLOSED = 'CLOSED',
}

export enum WorkType {
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

export enum WorkStatus {
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
