"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type {
  ReportKPIs,
  DailyAttendanceStat,
  ComplianceDistributionStat,
  LeaveCategoryStat,
  DepartmentWorkloadStat,
  WorkstationWorkloadStat,
} from "@/lib/reports/types";

type ReportsOverviewAnalyticsProps = {
  kpis: ReportKPIs;
  dailyStats: DailyAttendanceStat[];
  complianceStats: ComplianceDistributionStat[];
  leaveCategoryStats: LeaveCategoryStat[];
  departmentStats: DepartmentWorkloadStat[];
  workstationStats: WorkstationWorkloadStat[];
  periodLabel: string;
};

export default function ReportsOverviewAnalytics({
  kpis,
  dailyStats,
  complianceStats,
  leaveCategoryStats,
  departmentStats,
  workstationStats,
  periodLabel,
}: ReportsOverviewAnalyticsProps) {
  const [workloadGrouping, setWorkloadGrouping] = useState<"department" | "workstation">("department");

  return (
    <div className="space-y-6">
      {/* Executive Metric Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4.5 rounded-2xl card-hero-green text-white shadow-soft border border-white/20">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100/90">Payroll Hours</span>
          <p className="text-2xl font-black text-white mt-1.5">{kpis.totalPayrollHours}h</p>
          <p className="text-[11px] text-emerald-100/80 mt-0.5">
            Regular: <span className="font-bold text-white">{kpis.totalRegularHours}h</span>
          </p>
        </div>

        <div className="p-4.5 rounded-2xl card-gold text-amber-950 shadow-soft border border-amber-300/40">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900/80">Overtime (1.5x / 2x)</span>
          <p className="text-2xl font-black text-amber-950 mt-1.5">{kpis.totalOvertimeHours}h</p>
          <p className="text-[11px] text-amber-900/80 mt-0.5">
            {kpis.totalPayrollHours > 0
              ? `${Math.round((kpis.totalOvertimeHours / kpis.totalPayrollHours) * 100)}% of total hours`
              : "0%"}
          </p>
        </div>

        <div className="p-4.5 rounded-2xl border border-border/80 bg-surface shadow-soft">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Punctuality Score</span>
          <p className="text-2xl font-black text-primary mt-1.5">{kpis.averagePunctualityRate}%</p>
          <p className="text-[11px] text-muted mt-0.5">On-time shifts average</p>
        </div>

        <div className="p-4.5 rounded-2xl border border-border/80 bg-surface shadow-soft">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Attendance Rate</span>
          <p className="text-2xl font-black text-foreground mt-1.5">{kpis.averageAttendanceRate}%</p>
          <p className="text-[11px] text-muted mt-0.5">{kpis.totalEmployees} active employees</p>
        </div>

        <div className="p-4.5 rounded-2xl border border-border/80 bg-surface shadow-soft">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Leave Taken</span>
          <p className="text-2xl font-black text-foreground mt-1.5">{kpis.totalLeaveHours}h</p>
          <p className="text-[11px] text-muted mt-0.5">{kpis.totalAbsenceDays} total absence days</p>
        </div>

        <div className="p-4.5 rounded-2xl border border-border/80 bg-surface shadow-soft">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Compliance Flags</span>
          <p className={`text-2xl font-black mt-1.5 ${kpis.missingClockingCount > 0 ? "text-rose-600" : "text-foreground"}`}>
            {kpis.missingClockingCount}
          </p>
          <p className="text-[11px] text-muted mt-0.5">Missing clockings</p>
        </div>
      </div>

      {/* Row 1: Daily Hours Timeline Chart */}
      <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-soft space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h4 className="text-sm sm:text-base font-bold text-foreground">
              Daily Attendance &amp; Hours Worked Timeline
            </h4>
            <p className="text-xs text-muted mt-0.5">
              Workforce hours volume, regular hours, and overtime fluctuations over {periodLabel}.
            </p>
          </div>
        </div>

        {dailyStats.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted">
            No attendance records logged for the selected period.
          </div>
        ) : (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNormal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorOT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="formattedDate" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="h" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => [`${value} hrs`, name === "normalHours" ? "Normal Hours" : name === "overtimeHours" ? "Overtime" : String(name)]}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: "11px", paddingBottom: "10px" }}
                />
                <Area
                  type="monotone"
                  dataKey="normalHours"
                  name="Normal Hours"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorNormal)"
                />
                <Area
                  type="monotone"
                  dataKey="overtimeHours"
                  name="Overtime"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorOT)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Row 2: Two Columns: Punctuality Breakdown & Leave Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Punctuality & Clocking Compliance Donut */}
        <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-soft space-y-3.5">
          <div className="border-b border-border/60 pb-3">
            <h4 className="text-sm sm:text-base font-extrabold text-foreground">
              Clocking &amp; Punctuality Distribution
            </h4>
            <p className="text-xs text-muted mt-0.5">
              Shift arrival compliance, late arrivals (&gt;5m), early departures, and missing events.
            </p>
          </div>

          {complianceStats.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted">No clocking events to analyze.</div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={complianceStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {complianceStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                    formatter={(value, name) => [`${value} shifts`, String(name)]}
                  />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Leave Utilization by Statutory Category */}
        <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-soft space-y-3.5">
          <div className="border-b border-border/60 pb-3">
            <h4 className="text-sm sm:text-base font-extrabold text-foreground">
              Leave Taken by Category
            </h4>
            <p className="text-xs text-muted mt-0.5">
              Consumption across Annual, Sick, Family Responsibility, and Public Holidays.
            </p>
          </div>

          {leaveCategoryStats.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted">
              No approved leave taken during this period.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={leaveCategoryStats}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 35, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} unit="h" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                    formatter={(value, name, item) => [
                      `${value} hrs (${item.payload.days} days)`,
                      "Leave Taken",
                    ]}
                  />
                  <Bar dataKey="hours" name="Leave Hours" radius={[0, 6, 6, 0]}>
                    {leaveCategoryStats.map((entry, index) => (
                      <Cell key={`cell-lt-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Department / Workstation Workload Comparison */}
      <div className="rounded-2xl border border-border/80 bg-surface p-5 sm:p-6 shadow-soft space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h4 className="text-sm sm:text-base font-extrabold text-foreground">
              Hours Distribution &amp; Workload Comparison
            </h4>
            <p className="text-xs text-muted mt-0.5">
              Compare labor allocation and overtime concentration across business units.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-surface-muted rounded-full border border-border/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setWorkloadGrouping("department")}
              className={`px-3.5 py-1 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                workloadGrouping === "department"
                  ? "bg-primary text-white shadow-soft"
                  : "text-muted hover:text-foreground"
              }`}
            >
              By Department
            </button>
            <button
              type="button"
              onClick={() => setWorkloadGrouping("workstation")}
              className={`px-3.5 py-1 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                workloadGrouping === "workstation"
                  ? "bg-primary text-white shadow-soft"
                  : "text-muted hover:text-foreground"
              }`}
            >
              By Workstation
            </button>
          </div>
        </div>

        {workloadGrouping === "department" ? (
          departmentStats.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted">No department data available.</div>
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentStats} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="h" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "0.75rem",
                      color: "#f8fafc",
                      fontSize: "12px",
                    }}
                    formatter={(value, name) => [`${value} hrs`, name === "normalHours" ? "Normal Hours" : "Overtime Hours"]}
                  />
                  <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: "11px", paddingBottom: "10px" }} />
                  <Bar dataKey="normalHours" name="Normal Hours" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="overtimeHours" name="Overtime" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        ) : workstationStats.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted">No workstation data available.</div>
        ) : (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workstationStats} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="workstation" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="h" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "0.75rem",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(value, name, item) => [
                    `${value} hrs (${item.payload.shiftsCount} shifts, ${item.payload.punctualityRate}% punctuality)`,
                    "Total Hours Worked",
                  ]}
                />
                <Bar dataKey="totalHours" name="Total Hours Worked" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
