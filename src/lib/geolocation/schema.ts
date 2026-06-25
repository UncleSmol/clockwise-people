export type CompanyWorkstation = {
  id: string;
  company_id: string;
  branch_id: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_active: boolean;
  branch_name?: string | null;
  assigned_employee_count?: number;
};

export type EmployeeWorkstationAssignment = {
  employee_id: string;
  workstation_id: string;
};

export type WorkstationEmployeeOption = {
  id: string;
  label: string;
  workstation_id: string | null;
};

export type CompanyGeolocationData = {
  employees: WorkstationEmployeeOption[];
  assignments: EmployeeWorkstationAssignment[];
  workstations: CompanyWorkstation[];
};
