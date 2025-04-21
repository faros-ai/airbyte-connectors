export declare type EmployeeRecord = {
  Start_Date: Date;
  Full_Name: string;
  Employee_ID: string;
  Manager_Name: string;
  Manager_ID: string;
  Team_ID: string;
  Team_Name: string;
  Termination_Date?: Date;
  Termination_date?: Date;
  Location?: string;
  Email?: string;
  Employee_Type?: string;
  Job_Title?: string;
  Parent_Team_ID?: string;
  Vendor?: string;
};

export declare type ManagerTimeRecord = {
  Manager_ID: string;
  Timestamp: Date;
};

export declare type org_EmploymentType = {
  category: string;
  detail: string;
};

export const recordKeyTyping = {
  startdate: 'Start_Date',
  fullname: 'Full_Name',
  employeeid: 'Employee_ID',
  managername: 'Manager_Name',
  managerid: 'Manager_ID',
  teamname: 'Team_Name',
  teamid: 'Team_ID',
  terminationdate: 'Termination_Date',
  location: 'Location',
  email: 'Email',
  employeetype: 'Employee_Type',
  jobtitle: 'Job_Title',
  parentteamid: 'Parent_Team_ID',
  vendor: 'Vendor',
};
