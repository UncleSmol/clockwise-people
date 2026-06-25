import CompanyLeaveRequestQueue from "@/components/work-rules/CompanyLeaveRequestQueue";
import EmployeeLeaveRequests from "@/components/work-rules/EmployeeLeaveRequests";
import { getActiveCompany, getCurrentUserAccess } from "@/lib/foundation/queries";
import {
  getCompanyLeaveRequestQueue,
  getEmployeeLeaveState,
} from "@/lib/work-rules/queries";

export default async function LeavePage() {
  const [{ company }, access] = await Promise.all([
    getActiveCompany(),
    getCurrentUserAccess(),
  ]);
  const canReviewLeave = access.canReviewBranchTime || access.canManageDirectReports;
  const [leaveState, leaveRequests] = await Promise.all([
    access.employeeId ? getEmployeeLeaveState() : Promise.resolve(null),
    canReviewLeave ? getCompanyLeaveRequestQueue() : Promise.resolve([]),
  ]);

  return (
    <div className="grid gap-4">
      <header className="premium-hero rounded-md p-4 text-white sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
          Leave
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
          {company.name} time off
        </h1>
        <p className="mt-2 max-w-2xl text-sm opacity-80">
          Submit leave, review balances, and approve employee leave requests.
        </p>
      </header>

      {leaveState ? <EmployeeLeaveRequests state={leaveState} /> : null}

      {canReviewLeave ? <CompanyLeaveRequestQueue requests={leaveRequests} /> : null}
    </div>
  );
}
