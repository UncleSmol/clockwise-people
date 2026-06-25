const policies = [
  {
    title: "Location Data Collection Notice",
    body: [
      "ClockWise People collects browser-provided location only when an employee performs a clocking action.",
      "Location data is used to validate whether the clocking event happened inside the employee's assigned workstation radius.",
      "Location records may include latitude, longitude, GPS accuracy, workstation, distance from workstation, geofence status, event type, and event time.",
      "The app does not track employees continuously in the background when the browser is closed.",
    ],
  },
  {
    title: "Employee Monitoring Policy",
    body: [
      "Time, attendance, leave, and geofence records are processed for workforce administration, payroll preparation, compliance checks, and manager review.",
      "Managers may review submitted timesheets, location status, clocking exceptions, late arrivals, early departures, and missing clocking events.",
      "Employees should only clock from their own account and should not share login credentials.",
    ],
  },
  {
    title: "Privacy And POPIA Notice",
    body: [
      "The company is responsible for using employee personal information lawfully and only for legitimate employment and operational purposes.",
      "Personal information processed by the app may include identity details, contact details, employment details, time records, leave records, location records, and audit history.",
      "Access to employee information is role-based and limited to users who need it for HR, management, payroll, or employee self-service.",
    ],
  },
  {
    title: "Data Retention Policy",
    body: [
      "Time, leave, payroll preparation, audit, and location records should be retained for the period required by company policy and applicable law.",
      "Records should not be deleted or exported outside approved business processes unless authorised by company administrators.",
      "When an employee leaves, their account access should be disabled while required employment records remain available for lawful retention.",
    ],
  },
  {
    title: "Security And Access Policy",
    body: [
      "Users must keep passwords secure and report suspected account misuse immediately.",
      "Managers and administrators must only access records for employees they are authorised to manage.",
      "Administrative changes, approvals, and clocking events may be retained in audit records for accountability.",
    ],
  },
  {
    title: "Acceptable Use Policy",
    body: [
      "The app must be used for lawful workforce administration and employee self-service only.",
      "Users may not falsify time, location, leave, or employment information.",
      "Attempts to bypass geolocation, impersonate another employee, or manipulate records may be handled under company disciplinary processes.",
    ],
  },
];

export default function ComplianceDocuments() {
  return (
    <section className="grid gap-4">
      {policies.map((policy) => (
        <article key={policy.title} className="premium-card rounded-md p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-foreground">{policy.title}</h2>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted">
            {policy.body.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
