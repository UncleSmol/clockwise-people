"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Gavel,
  Layers,
  Lock,
  MapPin,
  Printer,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

type PolicyCategory =
  | "all"
  | "geolocation"
  | "popia_privacy"
  | "labour_bcea"
  | "governance_lra"
  | "security_retention";

type PolicyItem = {
  id: string;
  category: PolicyCategory;
  categoryLabel: string;
  title: string;
  subtitle: string;
  statutoryBasis: string;
  authority: string;
  authorityUrl?: string;
  lastAudited: string;
  badge: string;
  keyPoints: Array<{
    heading: string;
    description: string;
    statutoryRef?: string;
  }>;
  legalImplications?: string;
  technicalEnforcement?: string;
};

const comprehensivePolicies: PolicyItem[] = [
  {
    id: "geolocation-privacy",
    category: "geolocation",
    categoryLabel: "Geolocation & Privacy",
    title: "Live Work-Hours Geolocation Tracking & Privacy Protocol",
    subtitle:
      "Strictly gated GPS telemetry, significant movement filtering (>25m), and absolute zero off-duty surveillance.",
    statutoryBasis:
      "POPIA (Act 4 of 2013, Sec 9–14), RICA (Act 70 of 2002, Sec 4–6), OHSA (Act 85 of 1993, Sec 8)",
    authority: "Information Regulator of South Africa & Department of Employment and Labour",
    authorityUrl: "https://www.justice.gov.za/inforeg/",
    lastAudited: "August 2026",
    badge: "POPIA & OHSA Compliant",
    keyPoints: [
      {
        heading: "Strict Work-Hours Gating (Clocked-In Only)",
        description:
          "ClockWise People activates GPS location listeners strictly when an employee is actively clocked in during scheduled work hours. Mobile GPS hardware polling is programmatically torn down the instant an employee clocks out or begins an authorized rest break.",
        statutoryRef: "POPIA Section 10 (Justification & Consent)",
      },
      {
        heading: "Zero Off-Duty Surveillance Guarantee",
        description:
          "The platform enforces an absolute technical prohibition against background location tracking, GPS pinging, or geofence monitoring when employees are off shift, on leave, or clocked out. Personal time is completely unmonitored.",
        statutoryRef: "POPIA Section 11 & Constitution Sec 14",
      },
      {
        heading: "Significant Movement Trigger (>25m Filter)",
        description:
          "During an active clocked-in shift, location breadcrumbs are captured only when an employee's physical location shifts by at least 25 meters. This prevents intrusive micro-surveillance, filters GPS drift jitter, and preserves mobile device battery life.",
        statutoryRef: "POPIA Section 10 (Proportionality Principle)",
      },
      {
        heading: "Designated Workstation Geofencing",
        description:
          "Clocking events are verified against circular geofences defined for assigned company client sites, branch offices, or designated remote workstation radiuses to validate physical attendance without continuous surveillance.",
        statutoryRef: "BCEA Section 31 (Duty to Keep Records)",
      },
      {
        heading: "Data Collected & Stored",
        description:
          "Captured telemetry is limited to timestamp, latitude, longitude, horizontal accuracy (meters), computed distance to nearest assigned workstation, and geofence compliance status flag.",
        statutoryRef: "POPIA Section 13 (Purpose Specification)",
      },
    ],
    legalImplications:
      "Continuous or unannounced employee tracking outside work hours constitutes an unlawful violation of privacy under Section 14 of the South African Constitution and Section 10 of POPIA. ClockWise People's architectural gating ensures complete legal immunity for employers by technically preventing off-duty data capture.",
    technicalEnforcement:
      "Enforced natively via Capacitor Geolocation listeners that subscribe only upon successful clock-in and invoke clearWatch() immediately upon clock-out or session termination.",
  },
  {
    id: "popia-data-protection",
    category: "popia_privacy",
    categoryLabel: "Data Protection & POPIA",
    title: "Protection of Personal Information Act (POPIA) Compliance Policy",
    subtitle:
      "Comprehensive adherence to all 8 Statutory Conditions for the Lawful Processing of Employee Personal Information.",
    statutoryBasis:
      "Protection of Personal Information Act, No. 4 of 2013 (Republic of South Africa - GG 37067)",
    authority: "Information Regulator of South Africa (POPIA Regulator)",
    authorityUrl: "https://inforegulator.org.za/",
    lastAudited: "August 2026",
    badge: "Statutory POPIA 8-Condition Standard",
    keyPoints: [
      {
        heading: "Condition 1: Accountability (Section 8)",
        description:
          "The employer acts as the Responsible Party, and ClockWise People acts as the Operator. Both entities maintain documented technical and organizational measures to ensure statutory adherence.",
        statutoryRef: "POPIA Sec 8",
      },
      {
        heading: "Condition 2: Processing Limitation (Sections 9–12)",
        description:
          "Personal information (identity numbers, full names, biometric/avatar references, timestamps, leave notes) is processed lawfully, transparently, and only with employee knowledge for employment contract fulfillment.",
        statutoryRef: "POPIA Sec 9, 10, 11",
      },
      {
        heading: "Condition 3: Purpose Specification (Sections 13–14)",
        description:
          "Data is collected solely for workforce attendance management, shift scheduling, leave administration, payroll calculation, and statutory labour audit readiness. Data is retained strictly according to statutory retention schedules.",
        statutoryRef: "POPIA Sec 13 & 14",
      },
      {
        heading: "Condition 4: Further Processing Limitation (Section 15)",
        description:
          "Employee records are never sold, rented, monetized, or repurposed for third-party commercial advertising or behavioral profiling.",
        statutoryRef: "POPIA Sec 15",
      },
      {
        heading: "Condition 5: Information Quality (Section 16)",
        description:
          "The system provides self-service draft corrections, dispute escalation channels, and manager review workflows to ensure employee records are complete, accurate, and up-to-date.",
        statutoryRef: "POPIA Sec 16",
      },
      {
        heading: "Condition 6: Openness (Sections 17–18)",
        description:
          "Employees are provided with unambiguous notification regarding the nature of data collected, identity of the employer data controller, purpose of processing, and their statutory rights.",
        statutoryRef: "POPIA Sec 17 & 18",
      },
      {
        heading: "Condition 7: Security Safeguards (Sections 19–22)",
        description:
          "State-of-the-art security measures including database Row-Level Security (RLS), multi-tenant isolation, TLS 1.3 cryptographic transit encryption, AES-256 storage encryption, and strict role-based access control (RBAC).",
        statutoryRef: "POPIA Sec 19",
      },
      {
        heading: "Condition 8: Data Subject Participation (Sections 23–25)",
        description:
          "Employees possess the legal right to access, inspect, download (CSV/PDF), and request formal correction or deletion of inaccurate personal records.",
        statutoryRef: "POPIA Sec 23, 24",
      },
    ],
    legalImplications:
      "Non-compliance with POPIA carries statutory penalties of up to R10 million in administrative fines or imprisonment under Section 107. ClockWise People provides built-in POPIA audit readiness for enterprise human resources.",
    technicalEnforcement:
      "Row-Level Security (RLS) policies enforced at the PostgreSQL database tier, ensuring tenant isolation so data from one company can never be queried by another.",
  },
  {
    id: "labour-bcea-hours",
    category: "labour_bcea",
    categoryLabel: "Labour & Working Hours",
    title: "Basic Conditions of Employment Act (BCEA) Working Hours & Overtime Policy",
    subtitle:
      "Automated tracking of ordinary hours, mandatory rest intervals, and statutory overtime calculation rates.",
    statutoryBasis:
      "Basic Conditions of Employment Act, No. 75 of 1997 (as amended by Act 11 of 2002 & Act 20 of 2013)",
    authority: "Department of Employment and Labour (DoEL, South Africa)",
    authorityUrl: "https://www.labour.gov.za/",
    lastAudited: "August 2026",
    badge: "BCEA Chapter 2 Aligned",
    keyPoints: [
      {
        heading: "Maximum Ordinary Hours of Work (Section 9)",
        description:
          "The reporting engine evaluates shifts against statutory maximums: 45 ordinary hours per week (maximum 9 hours/day for a 5-day work week, or 8 hours/day for a >5-day work week).",
        statutoryRef: "BCEA Section 9(1)",
      },
      {
        heading: "Statutory Overtime Limits & Tiered Calculations (Section 10)",
        description:
          "Overtime is strictly tracked and capped in accordance with law (maximum 3 hours per day or 10 hours per week). The engine automatically categorizes and computes: 1.5x ordinary rate for normal overtime hours, and 2.0x double rate for Sunday work or Public Holidays.",
        statutoryRef: "BCEA Section 10(1) & 10(2)",
      },
      {
        heading: "Mandatory Meal Intervals (Section 14)",
        description:
          "An employee working continuously for more than 5 hours is legally entitled to a meal interval of at least 1 continuous hour (which may be reduced to 30 minutes by written agreement). ClockWise People logs lunch breaks and alerts managers to missing intervals.",
        statutoryRef: "BCEA Section 14(1)",
      },
      {
        heading: "Daily and Weekly Rest Periods (Section 15)",
        description:
          "Enforces tracking of minimum daily rest periods of 12 consecutive hours between ending and recommencing work, and weekly rest periods of at least 36 consecutive hours.",
        statutoryRef: "BCEA Section 15(1)",
      },
      {
        heading: "Statutory Duty to Keep Records (Section 31)",
        description:
          "Employers are legally mandated to retain time worked, remuneration paid, and leave records for at least three (3) years from the date of the last entry. ClockWise People provides tamper-evident 3-year archival.",
        statutoryRef: "BCEA Section 31",
      },
    ],
    legalImplications:
      "Failure to pay statutory overtime rates (1.5x/2.0x) or forcing employees beyond weekly maximum hours constitutes an unfair labour practice and illegal violation under BCEA Chapter 2, subject to compliance orders and CCMA arbitration.",
    technicalEnforcement:
      "Timesheet calculation aggregators automatically partition hours into normal_hours, overtime_hours_15 (1.5x), overtime_hours_20 (2.0x), and holiday_hours based on schedule baselines and holiday calendars.",
  },
  {
    id: "labour-bcea-leave",
    category: "labour_bcea",
    categoryLabel: "Labour & Leave Accruals",
    title: "Statutory Leave Entitlements & Accrual Compliance Policy",
    subtitle:
      "Automated accrual engine enforcing statutory Annual, Sick, Maternity, Parental, and Family Responsibility Leave.",
    statutoryBasis:
      "BCEA Chapter 3 (Sections 19–27), Labour Laws Amendment Act (Act 10 of 2018)",
    authority: "Department of Employment and Labour & CCMA",
    authorityUrl: "https://www.labour.gov.za/",
    lastAudited: "August 2026",
    badge: "BCEA Chapter 3 Aligned",
    keyPoints: [
      {
        heading: "Annual Leave Accrual Standards (Sections 20 & 21)",
        description:
          "Employees are legally entitled to at least 21 consecutive days (or 15 working days / 1 day for every 17 days worked) fully paid annual leave per 12-month leave cycle. Accrual rules in ClockWise People prevent unlawful leave forfeiture.",
        statutoryRef: "BCEA Section 20(2)",
      },
      {
        heading: "Paid Sick Leave Cycles (Sections 22–24)",
        description:
          "Tracks the 36-month sick leave cycle granting employees paid sick leave equivalent to the number of days they would normally work in 6 weeks (e.g., 30 days for 5-day workers, 36 days for 6-day workers).",
        statutoryRef: "BCEA Section 22(2)",
      },
      {
        heading: "Medical Certificate Proof of Incapacity (Section 23)",
        description:
          "Employers are entitled to require a valid medical certificate from a registered medical practitioner if an employee is absent for more than two (2) consecutive days or on more than one occasion during an eight-week period. The app enforces medical attachment uploads for verified sick leave claims.",
        statutoryRef: "BCEA Section 23(1)",
      },
      {
        heading: "Maternity & Parental Leave (Sections 25 & 25A)",
        description:
          "Guarantees at least four (4) consecutive months unpaid maternity leave, and ten (10) consecutive days parental leave for birth or adoption of a child, fully tracked in company rosters.",
        statutoryRef: "BCEA Section 25 & Act 10 of 2018",
      },
      {
        heading: "Family Responsibility Leave (Section 27)",
        description:
          "Tracks statutory minimum of three (3) to five (5) days paid family responsibility leave per annual cycle for death of a spouse, parent, child, or sibling, or illness of a child.",
        statutoryRef: "BCEA Section 27(2)",
      },
    ],
    legalImplications:
      "Unlawful deduction of leave or denial of statutory sick leave is a direct contravention of BCEA Chapter 3 and grounds for formal grievance lodging with the Department of Employment and Labour.",
    technicalEnforcement:
      "The system executes deterministic leave accrual algorithms linked directly to completed payroll periods and verifies document attachment flags before leave approval.",
  },
  {
    id: "governance-lra",
    category: "governance_lra",
    categoryLabel: "Governance & Due Process",
    title: "Labour Relations Act (LRA) Due Process & Evidence Integrity Policy",
    subtitle:
      "Tamper-evident timesheet audit trails, procedural fairness in timesheet adjustments, and dispute resolution.",
    statutoryBasis:
      "Labour Relations Act, No. 66 of 1995 (as amended), CCMA Guidelines on Misconduct Arbitrations",
    authority: "Commission for Conciliation, Mediation and Arbitration (CCMA)",
    authorityUrl: "https://www.ccma.org.za/",
    lastAudited: "August 2026",
    badge: "LRA & CCMA Evidentiary Standard",
    keyPoints: [
      {
        heading: "Immutable Audit Trail of Adjustments",
        description:
          "Every manager modification, timesheet approval, rejection, or clocking correction creates a permanent, immutable log recording the editor's identity, timestamp, previous value, new value, and mandatory justification note.",
        statutoryRef: "LRA Schedule 8 (Code of Good Practice)",
      },
      {
        heading: "Employee Draft & Dispute Submission Channel",
        description:
          "Employees can review draft timesheets, request corrections with reason notes, and inspect manager approvals before payroll periods are finalized, ensuring procedural fairness.",
        statutoryRef: "LRA Section 188 (Procedural Fairness)",
      },
      {
        heading: "Admissibility in Disciplinary & CCMA Hearings",
        description:
          "All electronic timesheets, GPS geofence verifications, and shift logs comply with the Electronic Communications and Transactions Act (ECTA, Act 25 of 2002) for admissibility as objective evidence during internal hearings or CCMA arbitrations.",
        statutoryRef: "ECTA Section 15 (Admissibility of Data Messages)",
      },
    ],
    legalImplications:
      "Unilateral alteration of employee work hours without audit trails constitutes unlawful wage docking and procedural unfairness under LRA Schedule 8.",
    technicalEnforcement:
      "Database-level append-only audit tables and change-logging triggers prevent silent overwrites or retroactive ledger manipulation.",
  },
  {
    id: "rica-telemetry",
    category: "governance_lra",
    categoryLabel: "Workplace Telemetry (RICA)",
    title: "RICA Workplace Monitoring & Telemetry Policy",
    subtitle:
      "Statutory notice of system monitoring, device telemetry limits, and prohibition of private communications interception.",
    statutoryBasis:
      "Regulation of Interception of Communications and Provision of Communication-Related Information Act, No. 70 of 2002 (Sections 4, 5 & 6)",
    authority: "Department of Justice and Constitutional Development",
    authorityUrl: "https://www.justice.gov.za/",
    lastAudited: "August 2026",
    badge: "RICA Section 6 Aligned",
    keyPoints: [
      {
        heading: "Advance Written Notice of Workplace Monitoring",
        description:
          "In accordance with Section 6 of RICA, employees are hereby notified that platform access logs, IP addresses, workstation proximity checks, and clocking telemetry are monitored strictly for operational administration on company systems.",
        statutoryRef: "RICA Section 6(2)",
      },
      {
        heading: "Prohibition of Private Communication Interception",
        description:
          "ClockWise People does NOT monitor, record, or intercept personal telephone calls, private SMS/messaging, private browser histories, or device files. Telemetry is restricted to work time tracking.",
        statutoryRef: "RICA Section 2 (General Prohibition)",
      },
    ],
    legalImplications:
      "Interception of communications without statutory notice or consent constitutes a criminal offense under Section 2 of RICA.",
    technicalEnforcement:
      "System permissions requested on mobile devices are limited strictly to Foreground Location (when clocked in) and Camera/Photo Library (only when uploading leave receipts).",
  },
  {
    id: "ohsa-safety",
    category: "governance_lra",
    categoryLabel: "Health, Safety & OHSA",
    title: "Occupational Health and Safety (OHSA) Lone-Worker Safety & Mustering Policy",
    subtitle:
      "Duty of care operational monitoring, remote worker safety dispatch, and emergency muster roll verification.",
    statutoryBasis:
      "Occupational Health and Safety Act, No. 85 of 1993 (Section 8 & General Safety Regulations)",
    authority: "Department of Employment and Labour (Chief Inspectorate)",
    authorityUrl: "https://www.labour.gov.za/",
    lastAudited: "August 2026",
    badge: "OHSA Section 8 Safety Duty",
    keyPoints: [
      {
        heading: "Employer Duty of Care (Section 8)",
        description:
          "Employers are legally obligated to provide and maintain a working environment that is safe and without risk to health. Work-hours geolocation verification supports this duty for field workers, dispatched contractors, and lone technicians.",
        statutoryRef: "OHSA Section 8(1)",
      },
      {
        heading: "Emergency Mustering & Disaster Verification",
        description:
          "In the event of site evacuations, fires, or industrial incidents, ClockWise People's live attendance roster immediately provides safety officers with an accurate list of all personnel clocked in on-site.",
        statutoryRef: "OHSA Environmental Regulations",
      },
    ],
    legalImplications:
      "Failure to account for workers in hazardous environments can result in civil liability and statutory penalties under the Compensation for Occupational Injuries and Diseases Act (COIDA).",
    technicalEnforcement:
      "Live Overview Dashboard displays active clocked-in personnel in real time with timestamp of last site verification.",
  },
  {
    id: "security-retention",
    category: "security_retention",
    categoryLabel: "Security & Retention",
    title: "Data Retention, Cryptographic Security & Archival Policy",
    subtitle:
      "Multi-year statutory retention schedules, automated de-identification, and ISO/IEC 27001 security standards.",
    statutoryBasis:
      "BCEA Section 31, Tax Administration Act (Act 28 of 2011, Sec 29), POPIA Section 14, ISO/IEC 27001:2022",
    authority: "South African Revenue Service (SARS) & Information Regulator",
    authorityUrl: "https://www.sars.gov.za/",
    lastAudited: "August 2026",
    badge: "ISO 27001 & SARS Retention Standard",
    keyPoints: [
      {
        heading: "Statutory 3-Year Labour Retention (BCEA)",
        description:
          "Attendance, hours worked, timesheet approvals, and leave histories are archived for a mandatory minimum of 3 years to satisfy Department of Employment and Labour statutory inspections.",
        statutoryRef: "BCEA Section 31(1)",
      },
      {
        heading: "Statutory 5-Year Tax & Payroll Archival (SARS)",
        description:
          "Gross payroll reports, overtime breakdowns, and wage remuneration calculations are retained for five (5) years in compliance with the Tax Administration Act.",
        statutoryRef: "Tax Administration Act Section 29",
      },
      {
        heading: "POPIA De-Identification & Destruction Rule",
        description:
          "Location breadcrumbs and transient telemetry exceeding legal necessity periods are automatically anonymized or purged when no longer required for active employment contracts.",
        statutoryRef: "POPIA Section 14(1)",
      },
      {
        heading: "Cryptographic Safeguards & Multi-Tenancy",
        description:
          "Data at rest is secured via AES-256 block encryption. Data in transit is enforced via TLS 1.3 with Strict Transport Security (HSTS). Complete logical isolation is enforced via database Row-Level Security.",
        statutoryRef: "POPIA Section 19 & ISO 27001 Control A.8.24",
      },
    ],
    legalImplications:
      "Premature destruction of employment records violates BCEA Section 31 and SARS tax regulations, exposing companies to punitive fines.",
    technicalEnforcement:
      "Automated automated database backup snapshots and immutable export pipelines generate signed audit archives.",
  },
  {
    id: "acceptable-use",
    category: "security_retention",
    categoryLabel: "Acceptable Use & Anti-Fraud",
    title: "Platform Acceptable Use, Anti-Fraud & Credential Security Policy",
    subtitle:
      "Prohibition of GPS spoofing, proxy clocking, credential sharing, and disciplinary consequences.",
    statutoryBasis:
      "Cybercrimes Act (Act 19 of 2020), Common Law Duty of Good Faith, LRA Schedule 8",
    authority: "Commission for Conciliation, Mediation and Arbitration (CCMA)",
    authorityUrl: "https://www.ccma.org.za/",
    lastAudited: "August 2026",
    badge: "Anti-Fraud & Cybercrimes Standard",
    keyPoints: [
      {
        heading: "Prohibition of Proxy or 'Buddy' Clocking",
        description:
          "Employees must clock in and out exclusively from their personal authenticated mobile or browser session. Logging hours on behalf of another employee is fraudulent and subject to disciplinary action.",
        statutoryRef: "Common Law Fraud & LRA Schedule 8",
      },
      {
        heading: "Prohibition of GPS Mocking & Location Spoofing",
        description:
          "Using mock location software, emulator overrides, or VPN obfuscation to fake presence inside a company workstation geofence is strictly forbidden and actively detected.",
        statutoryRef: "Cybercrimes Act Section 3 (Unlawful Data Access)",
      },
      {
        heading: "Account Credential Security",
        description:
          "Users must maintain strict secrecy of passwords and session tokens. Sharing manager or admin accounts is a severe breach of security governance.",
        statutoryRef: "POPIA Section 19",
      },
    ],
    legalImplications:
      "Deliberate falsification of attendance records constitutes gross dishonesty and fraud under South African labour law, providing lawful grounds for summary dismissal following a fair disciplinary hearing.",
    technicalEnforcement:
      "GPS mock provider detection on Android/iOS mobile builds flags fraudulent clocking attempts in audit exception queues.",
  },
];

export default function ComplianceDocuments() {
  const [activeCategory, setActiveCategory] = useState<PolicyCategory>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(
    new Set(["geolocation-privacy", "popia-data-protection"]),
  );

  const togglePolicy = (id: string) => {
    setExpandedPolicies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedPolicies(new Set(comprehensivePolicies.map((p) => p.id)));
  };

  const collapseAll = () => {
    setExpandedPolicies(new Set());
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredPolicies = useMemo(() => {
    return comprehensivePolicies.filter((policy) => {
      const matchesCategory =
        activeCategory === "all" || policy.category === activeCategory;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      return (
        policy.title.toLowerCase().includes(query) ||
        policy.subtitle.toLowerCase().includes(query) ||
        policy.statutoryBasis.toLowerCase().includes(query) ||
        policy.authority.toLowerCase().includes(query) ||
        policy.keyPoints.some(
          (kp) =>
            kp.heading.toLowerCase().includes(query) ||
            kp.description.toLowerCase().includes(query),
        )
      );
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="grid min-w-0 gap-5">
      {/* Top Banner & Governance Header */}
      <div className="rounded-xl border-2 border-slate-900 bg-slate-950 p-4 sm:p-6 text-white shadow-md">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                <ShieldCheck className="size-3.5" />
                Statutory Verified
              </span>
              <span className="text-xs font-bold text-slate-400">
                POPIA · BCEA · LRA · RICA · OHSA · GDPR Aligned
              </span>
            </div>
            <h1 className="mt-2 text-xl font-black sm:text-2xl lg:text-3xl text-white">
              Legal Compliance, Privacy &amp; Governance Center
            </h1>
            <p className="mt-1 max-w-3xl text-xs sm:text-sm text-slate-300 leading-relaxed">
              Authoritative documentation of statutory labor frameworks, data privacy safeguards,
              work-hours geolocation boundaries, and institutional compliance standards adhered to by ClockWise People.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 transition-all"
              title="Print policy handbook"
            >
              <Printer className="size-3.5" />
              <span>Print Handbook</span>
            </button>
            <button
              type="button"
              onClick={expandedPolicies.size === comprehensivePolicies.length ? collapseAll : expandAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-extrabold text-slate-200 hover:bg-slate-800 transition-all"
            >
              <Layers className="size-3.5" />
              <span>{expandedPolicies.size === comprehensivePolicies.length ? "Collapse All" : "Expand All"}</span>
            </button>
          </div>
        </div>

        {/* Regulatory Authorities Quick Chips */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-800 pt-3 text-[11px]">
          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mr-1">
            Governing Authorities:
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 font-semibold text-slate-200 border border-slate-800">
            <Building2 className="size-3 text-slate-400" />
            Information Regulator (POPIA)
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 font-semibold text-slate-200 border border-slate-800">
            <Scale className="size-3 text-slate-400" />
            Department of Employment &amp; Labour (BCEA/OHSA)
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 font-semibold text-slate-200 border border-slate-800">
            <FileText className="size-3 text-slate-400" />
            CCMA (LRA Schedule 8)
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 font-semibold text-slate-200 border border-slate-800">
            <ShieldCheck className="size-3 text-slate-400" />
            SARS Tax Admin Act (Sec 29)
          </span>
        </div>
      </div>

      {/* Interactive Category & Search Bar */}
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Category Pill Navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", "All Policies", ShieldCheck],
                ["geolocation", "GPS & Geofencing", MapPin],
                ["popia_privacy", "POPIA & Privacy", Lock],
                ["labour_bcea", "BCEA Labour & Leave", Clock],
                ["governance_lra", "LRA, RICA & OHSA", Gavel],
                ["security_retention", "Security & Retention", ShieldAlert],
              ] as const
            ).map(([cat, label, Icon]) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-background border border-border text-muted hover:bg-surface-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Query Input */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search compliance clauses..."
              className="h-8.5 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs font-bold text-foreground placeholder:text-muted outline-none focus:border-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Policies Roster */}
      <div className="grid gap-4">
        {filteredPolicies.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-surface p-8 text-center text-xs font-semibold text-muted">
            No compliance policy clauses matched your search query &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredPolicies.map((policy) => {
            const isExpanded = expandedPolicies.has(policy.id);

            return (
              <article
                key={policy.id}
                className="overflow-hidden rounded-xl border-2 border-border bg-surface shadow-2xs transition-all hover:border-slate-400"
              >
                {/* Policy Accordion Header */}
                <div
                  onClick={() => togglePolicy(policy.id)}
                  className="flex cursor-pointer flex-col gap-3 p-4 sm:p-5 hover:bg-surface-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="rounded bg-slate-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                          {policy.categoryLabel}
                        </span>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-950 border border-emerald-300">
                          {policy.badge}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-black text-foreground">
                        {policy.title}
                      </h2>
                      <p className="mt-0.5 text-xs sm:text-sm text-muted">
                        {policy.subtitle}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label="Toggle policy details"
                        className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted hover:text-foreground"
                      >
                        <ChevronDown
                          className={`size-4 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Statutory Authority Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px] text-muted">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Scale className="size-3.5 text-accent shrink-0" />
                      <span>Statutory Reference:</span>
                      <span className="font-extrabold text-foreground">{policy.statutoryBasis}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                      <span>Audited: {policy.lastAudited}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded Policy Body */}
                {isExpanded && (
                  <div className="border-t-2 border-border/80 bg-background/50 p-4 sm:p-5 grid gap-4 text-xs sm:text-sm leading-relaxed">
                    {/* Key Statutory Clauses List */}
                    <div className="grid gap-2.5">
                      <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <BookOpen className="size-3.5 text-accent" />
                        Key Compliance Provisions &amp; Clauses
                      </h3>
                      <div className="grid gap-2">
                        {policy.keyPoints.map((point, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-border bg-surface p-3 shadow-2xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                              <h4 className="font-extrabold text-foreground flex items-center gap-2">
                                <span className="flex size-4.5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white shrink-0">
                                  {idx + 1}
                                </span>
                                {point.heading}
                              </h4>
                              {point.statutoryRef && (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                                  {point.statutoryRef}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted pl-6 leading-relaxed">
                              {point.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Legal Implications & Technical Enforcement Boxes */}
                    <div className="grid gap-3 sm:grid-cols-2 pt-2">
                      {policy.legalImplications && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-950">
                          <p className="font-black uppercase tracking-wider text-[10px] text-amber-900 flex items-center gap-1.5 mb-1">
                            <Scale className="size-3.5 text-amber-800 shrink-0" />
                            Legal Implications &amp; Employer Protection
                          </p>
                          <p className="text-amber-900/90 leading-relaxed font-medium">
                            {policy.legalImplications}
                          </p>
                        </div>
                      )}

                      {policy.technicalEnforcement && (
                        <div className="rounded-lg border border-indigo-300 bg-indigo-50/80 p-3 text-xs text-indigo-950">
                          <p className="font-black uppercase tracking-wider text-[10px] text-indigo-900 flex items-center gap-1.5 mb-1">
                            <Lock className="size-3.5 text-indigo-800 shrink-0" />
                            Technical &amp; Architectural Enforcement
                          </p>
                          <p className="text-indigo-900/90 leading-relaxed font-medium">
                            {policy.technicalEnforcement}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Oversight Authority Citation */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3 text-[11px] text-muted">
                      <span className="font-bold">
                        Regulatory Oversight: <strong className="text-foreground">{policy.authority}</strong>
                      </span>
                      {policy.authorityUrl && (
                        <a
                          href={policy.authorityUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 font-extrabold text-emerald-700 hover:text-emerald-800 transition-colors"
                        >
                          Official Regulatory Portal
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Trusted Regulatory Citations & Statutory References Footnote */}
      <footer className="rounded-xl border-2 border-slate-300 bg-slate-100 p-4 sm:p-5 text-xs text-slate-800 shadow-2xs">
        <h3 className="font-black text-sm uppercase tracking-wider text-slate-900 flex items-center gap-2 mb-2">
          <Building2 className="size-4 text-slate-900" />
          Authoritative Legal Gazette &amp; Statutory Repository References
        </h3>
        <p className="text-xs text-slate-600 mb-3 leading-relaxed">
          The compliance rules, leave accrual formulas, overtime rate calculations, and data privacy controls
          implemented within ClockWise People adhere strictly to the following gazetted statutes:
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[11px]">
          <div className="rounded-lg bg-white p-2.5 border border-slate-300">
            <p className="font-extrabold text-slate-900">POPIA (Act No. 4 of 2013)</p>
            <p className="text-slate-600 mt-0.5">Government Gazette No. 37067</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-1">Information Regulator of South Africa</p>
          </div>

          <div className="rounded-lg bg-white p-2.5 border border-slate-300">
            <p className="font-extrabold text-slate-900">BCEA (Act No. 75 of 1997)</p>
            <p className="text-slate-600 mt-0.5">As amended by Acts 11 of 2002 &amp; 20 of 2013</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-1">Department of Employment and Labour</p>
          </div>

          <div className="rounded-lg bg-white p-2.5 border border-slate-300">
            <p className="font-extrabold text-slate-900">LRA (Act No. 66 of 1995)</p>
            <p className="text-slate-600 mt-0.5">Schedule 8 Code of Good Practice: Dismissal</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-1">CCMA National Rules</p>
          </div>

          <div className="rounded-lg bg-white p-2.5 border border-slate-300">
            <p className="font-extrabold text-slate-900">RICA (Act No. 70 of 2002)</p>
            <p className="text-slate-600 mt-0.5">Sections 4, 5, and 6 (Workplace Notice)</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-1">Department of Justice</p>
          </div>

          <div className="rounded-lg bg-white p-2.5 border border-slate-300">
            <p className="font-extrabold text-slate-900">OHSA (Act No. 85 of 1993)</p>
            <p className="text-slate-600 mt-0.5">General Safety Regulations &amp; Section 8 Duty</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-1">DoEL Chief Inspectorate</p>
          </div>

          <div className="rounded-lg bg-white p-2.5 border border-slate-300">
            <p className="font-extrabold text-slate-900">Tax Administration Act (Act 28 of 2011)</p>
            <p className="text-slate-600 mt-0.5">Section 29 (5-Year Statutory Archival Rule)</p>
            <p className="text-[10px] text-emerald-700 font-bold mt-1">South African Revenue Service (SARS)</p>
          </div>
        </div>

        <p className="mt-3 text-[10px] text-slate-500 italic">
          Disclaimer: This policy center provides a structural summary of statutory compliance frameworks implemented by the software.
          Individual employment agreements and sector-specific bargaining council collective agreements may specify additional terms.
        </p>
      </footer>
    </div>
  );
}
