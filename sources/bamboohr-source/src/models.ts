export interface User {
  id: number;
  employeeId: number;
  employeeNumber: string;
  jobTitle: string;
  status: string;
  employmentHistoryStatus: string;
  address1?: string;
  address2?: string;
  birthday?: string;
  bestEmail: string;
  workEmail: string;
  workPhone?: string;
  city?: string;
  country?: string;
  department?: string;
  ethnicity?: string;
  firstName?: string;
  gender?: string;
  middleName?: string;
  mobilePhone?: string;
  zipcode?: string;
  hireDate?: string;
  supervisor?: string;
  payRate?: string;
  payFrequency?: string;
  supervisorId?: string;
}
