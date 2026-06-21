export type InvitationStatus = "pending" | "accepted" | "cancelled" | "expired";

export type EmployeeInvitation = {
  id: string;
  company_id: string;
  employee_id: string;
  email: string;
  role_key: "owner" | "hr_admin" | "branch_manager" | "payroll_viewer" | "employee";
  status: InvitationStatus;
  invited_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  expires_at: string;
};
