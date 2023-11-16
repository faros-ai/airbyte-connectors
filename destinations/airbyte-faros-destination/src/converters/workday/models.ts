export declare type EmployeeRecord = {
  Start_Date: Date;
  Full_Name: string;
  Employee_ID: string;
  Manager_Name: string;
  Manager_ID: string;
  Team_Name: string;
  Termination_Date?: Date;
  Location?: string;
  Email?: string;
};

export declare type ManagerTimeRecord = {
  Manager_ID: string;
  Timestamp: Date;
};

export const recordKeyTyping = {
  startdate: 'Start_Date',
  fullname: 'Full_Name',
  employeeid: 'Employee_ID',
  managername: 'Manager_Name',
  managerid: 'Manager_ID',
  teamname: 'Team_Name',
  terminationdate: 'Termination_Date',
  location: 'Location',
  email: 'Email',
};
