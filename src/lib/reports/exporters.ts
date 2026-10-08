export function exportReportToCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(escapeCell).join(",");
  const rowLines = rows.map((r) => r.map(escapeCell).join(","));
  const csvContent = [headerLine, ...rowLines].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportReportToExcel(
  reportTitle: string,
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  metadata?: Record<string, string | number>,
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const dataMatrix: Array<Array<string | number | boolean | null | undefined>> = [
    [reportTitle.toUpperCase()],
    [],
  ];

  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      dataMatrix.push([k, v]);
    }
    dataMatrix.push([]);
  }

  dataMatrix.push(headers);
  dataMatrix.push(...rows);

  const ws = XLSX.utils.aoa_to_sheet(dataMatrix);

  // Set column widths based on longest string in each column
  const colWidths = headers.map((h, i) => {
    let max = h.length;
    for (const r of rows) {
      const cellLen = String(r[i] ?? "").length;
      if (cellLen > max) max = cellLen;
    }
    return { wch: Math.min(40, Math.max(12, max + 3)) };
  });
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function triggerPrintHtml(html: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const printViaIframe = () => {
    try {
      const existing = document.getElementById("cw-print-iframe");
      if (existing) existing.remove();

      const iframe = document.createElement("iframe");
      iframe.id = "cw-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.top = "-9999px";
      iframe.style.left = "-9999px";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.border = "none";
      iframe.style.opacity = "0";
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!frameDoc) throw new Error("Frame doc unavailable");

      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 60000);
        }
      }, 350);
      return true;
    } catch {
      return false;
    }
  };

  if (isMobile) {
    if (!printViaIframe()) {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        window.print();
      }
    }
    return;
  }

  // Desktop
  let printWindow: Window | null = null;
  try {
    printWindow = window.open("", "_blank");
  } catch {
    printWindow = null;
  }

  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    if (!printViaIframe()) {
      window.print();
    }
  }
}

export function exportReportToPdf(
  reportTitle: string,
  filename: string,
  companyName: string,
  periodLabel: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  kpis?: Array<{ label: string; value: string | number }>,
) {
  const isLandscape = headers.length > 7;

  const generatedDate = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const kpisHtml =
    kpis && kpis.length > 0
      ? `
    <div style="display: grid; grid-template-columns: repeat(${Math.min(6, kpis.length)}, 1fr); gap: 8px; margin-bottom: 14px;">
      ${kpis
        .map(
          (k) => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 9px;">
          <div style="font-size: 8.5px; font-weight: 700; color: #64748b; text-transform: uppercase;">${k.label}</div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 2px;">${k.value}</div>
        </div>
      `,
        )
        .join("")}
    </div>
    `
      : "";

  const tableHeaderHtml = headers
    .map(
      (h) =>
        `<th style="background: #0f172a; color: #ffffff; font-size: 9.5px; font-weight: 700; text-align: left; padding: 6px 7px; border: 1px solid #1e293b;">${h}</th>`,
    )
    .join("");

  const tableRowsHtml = rows
    .map(
      (r, idx) => `
    <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
      ${r
        .map(
          (cell) =>
            `<td style="font-size: 9px; color: #1e293b; padding: 4.5px 7px; border: 1px solid #e2e8f0;">${
              cell === null || cell === undefined ? "--" : String(cell)
            }</td>`,
        )
        .join("")}
    </tr>
  `,
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${filename}</title>
        <style>
          @page {
            size: A4 ${isLandscape ? "landscape" : "portrait"};
            margin: 10mm;
          }
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          body { margin: 0; padding: 0; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .header { background: #0f172a; color: #fff; padding: 12px 16px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
          .title { font-size: 15px; font-weight: 800; margin: 0; }
          .subtitle { font-size: 10.5px; color: #94a3b8; margin-top: 2px; }
          .meta { font-size: 9.5px; color: #cbd5e1; text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          .footer { margin-top: 14px; font-size: 8.5px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${companyName.toUpperCase()}</div>
            <div class="subtitle">${reportTitle} · Payroll Period: ${periodLabel}</div>
          </div>
          <div class="meta">
            <div>Generated: ${generatedDate}</div>
            <div>ClockWise People Audit System</div>
          </div>
        </div>
        ${kpisHtml}
        <table>
          <thead><tr>${tableHeaderHtml}</tr></thead>
          <tbody>${tableRowsHtml}</tbody>
        </table>
        <div class="footer">
          <span>ClockWise People Automated Compliance &amp; Payroll Report</span>
          <span>Official Business Record</span>
        </div>
      </body>
    </html>
  `;

  triggerPrintHtml(html);
}

export type ConjoinedPdfOptions = {
  companyName: string;
  reportTitle?: string;
  filename: string;
  periodLabel: string;
  employeeInfo: {
    name: string;
    employeeNumber?: string;
    department?: string;
    workstation?: string;
  };
  kpis: Array<{ label: string; value: string | number; sub?: string }>;
  leaveBalances?: Array<{
    name: string;
    category?: string;
    accrued: string | number;
    taken: string | number;
    balance: string | number;
    isPaid?: boolean;
  }>;
  timesheetHeaders: string[];
  timesheetRows: Array<Array<string | number | boolean | null | undefined>>;
  leaveHeaders?: string[];
  leaveRows?: Array<Array<string | number | boolean | null | undefined>>;
};

export function exportEmployeeConjoinedPdf(options: ConjoinedPdfOptions) {
  const {
    companyName,
    reportTitle = "Official Employee Time, Attendance & Leave Statement",
    filename,
    periodLabel,
    employeeInfo,
    kpis,
    leaveBalances = [],
    timesheetHeaders,
    timesheetRows,
    leaveHeaders = ["Leave Type", "Date Range", "Days", "Total Hours", "Status", "Reason"],
    leaveRows = [],
  } = options;

  const generatedDate = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const kpisHtml =
    kpis && kpis.length > 0
      ? `
    <div style="display: grid; grid-template-columns: repeat(${Math.min(5, kpis.length)}, 1fr); gap: 8px; margin-bottom: 14px;">
      ${kpis
        .map(
          (k) => `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px;">
          <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">${k.label}</div>
          <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin-top: 2px; font-family: monospace;">${k.value}</div>
          ${k.sub ? `<div style="font-size: 8px; color: #64748b; margin-top: 1px;">${k.sub}</div>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>
    `
      : "";

  // Leave Balances Table HTML
  const leaveBalancesTableHtml =
    leaveBalances.length > 0
      ? `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
      <thead>
        <tr>
          <th style="background: #064e3b; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: left; padding: 5px 8px; border: 1px solid #065f46;">Leave Type</th>
          <th style="background: #064e3b; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: left; padding: 5px 8px; border: 1px solid #065f46;">Category</th>
          <th style="background: #064e3b; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: right; padding: 5px 8px; border: 1px solid #065f46;">Accrued</th>
          <th style="background: #064e3b; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: right; padding: 5px 8px; border: 1px solid #065f46;">Taken</th>
          <th style="background: #064e3b; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: right; padding: 5px 8px; border: 1px solid #065f46;">Available Balance</th>
          <th style="background: #064e3b; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: center; padding: 5px 8px; border: 1px solid #065f46;">Benefit</th>
        </tr>
      </thead>
      <tbody>
        ${leaveBalances
          .map(
            (b, idx) => `
          <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f0fdf4"};">
            <td style="font-size: 8.5px; font-weight: 700; color: #0f172a; padding: 4.5px 8px; border: 1px solid #cbd5e1;">${b.name}</td>
            <td style="font-size: 8px; color: #475569; padding: 4.5px 8px; border: 1px solid #cbd5e1; text-transform: capitalize;">${b.category ?? "Standard"}</td>
            <td style="font-size: 8.5px; font-family: monospace; text-align: right; color: #475569; padding: 4.5px 8px; border: 1px solid #cbd5e1;">${b.accrued}</td>
            <td style="font-size: 8.5px; font-family: monospace; text-align: right; color: #b91c1c; padding: 4.5px 8px; border: 1px solid #cbd5e1;">${b.taken}</td>
            <td style="font-size: 9px; font-family: monospace; font-weight: 800; text-align: right; color: #065f46; padding: 4.5px 8px; border: 1px solid #cbd5e1;">${b.balance}</td>
            <td style="font-size: 8px; text-align: center; color: ${b.isPaid !== false ? "#065f46" : "#64748b"}; font-weight: 700; padding: 4.5px 8px; border: 1px solid #cbd5e1;">${
              b.isPaid !== false ? "Paid Benefit" : "Unpaid"
            }</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    `
      : `<p style="font-size: 8.5px; color: #64748b; font-style: italic; margin-bottom: 12px;">No active leave balances assigned.</p>`;

  // Timesheet Table HTML
  const tsHeaderHtml = timesheetHeaders
    .map(
      (h) =>
        `<th style="background: #0f172a; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: left; padding: 5px 6px; border: 1px solid #1e293b;">${h}</th>`,
    )
    .join("");

  const tsRowsHtml =
    timesheetRows.length > 0
      ? timesheetRows
          .map(
            (r, idx) => `
        <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
          ${r
            .map(
              (cell) =>
                `<td style="font-size: 8px; color: #1e293b; padding: 4px 6px; border: 1px solid #e2e8f0;">${
                  cell === null || cell === undefined ? "--" : String(cell)
                }</td>`,
            )
            .join("")}
        </tr>
      `,
          )
          .join("")
      : `<tr><td colspan="${timesheetHeaders.length}" style="text-align: center; padding: 8px; font-size: 8.5px; color: #64748b;">No timesheet entries in this period.</td></tr>`;

  // Leave Rows Table HTML
  const leaveRowsHtml =
    leaveRows.length > 0
      ? `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
      <thead>
        <tr>
          ${leaveHeaders
            .map(
              (h) =>
                `<th style="background: #0f172a; color: #ffffff; font-size: 8.5px; font-weight: 700; text-align: left; padding: 5px 6px; border: 1px solid #1e293b;">${h}</th>`,
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${leaveRows
          .map(
            (r, idx) => `
          <tr style="background: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
            ${r
              .map(
                (cell) =>
                  `<td style="font-size: 8px; color: #1e293b; padding: 4px 6px; border: 1px solid #e2e8f0;">${
                    cell === null || cell === undefined ? "--" : String(cell)
                  }</td>`,
              )
              .join("")}
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    `
      : `<p style="font-size: 8.5px; color: #64748b; font-style: italic; margin-bottom: 12px;">No approved leave or absence requests during this period.</p>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${filename}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 8mm 10mm 8mm;
          }
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          body { margin: 0; padding: 0; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .header-box { background: #0f172a; color: #fff; padding: 10px 14px; border-radius: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
          .company-name { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; margin: 0; }
          .doc-title { font-size: 10px; color: #34d399; font-weight: 700; margin-top: 1px; }
          .doc-meta { font-size: 8.5px; color: #cbd5e1; text-align: right; }
          .employee-banner { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }
          .emp-label { font-size: 7.5px; font-weight: 700; color: #64748b; text-transform: uppercase; }
          .emp-value { font-size: 10px; font-weight: 800; color: #0f172a; margin-top: 1px; }
          .section-title { font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 10px 0 4px 0; display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; margin-bottom: 10px; }
          tr { page-break-inside: avoid; }
          .signoff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #cbd5e1; page-break-inside: avoid; }
          .sign-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; background: #fafafa; }
          .sign-title { font-size: 8.5px; font-weight: 700; color: #475569; text-transform: uppercase; }
          .sign-line { border-bottom: 1px solid #0f172a; height: 26px; margin: 8px 0 4px 0; }
          .sign-date { font-size: 8px; color: #64748b; }
          .footer { margin-top: 14px; font-size: 7.5px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <div class="company-name">${companyName.toUpperCase()}</div>
            <div class="doc-title">${reportTitle.toUpperCase()}</div>
          </div>
          <div class="doc-meta">
            <div>Payroll Period: <strong style="color: #fff;">${periodLabel}</strong></div>
            <div>Generated: ${generatedDate}</div>
          </div>
        </div>

        <div class="employee-banner">
          <div>
            <div class="emp-label">Employee Name</div>
            <div class="emp-value">${employeeInfo.name}</div>
          </div>
          <div>
            <div class="emp-label">Employee Number</div>
            <div class="emp-value">${employeeInfo.employeeNumber || "N/A"}</div>
          </div>
          <div>
            <div class="emp-label">Department</div>
            <div class="emp-value">${employeeInfo.department || "General"}</div>
          </div>
          <div>
            <div class="emp-label">Workstation</div>
            <div class="emp-value">${employeeInfo.workstation || "Standard"}</div>
          </div>
        </div>

        ${kpisHtml}

        <div class="section-title">
          <span>1. Conjoined Leave Entitlements &amp; Balances</span>
          <span style="font-size: 8px; color: #065f46; font-weight: 700;">Live Balance Ledger</span>
        </div>
        ${leaveBalancesTableHtml}

        <div class="section-title">
          <span>2. Worked Hours &amp; Daily Attendance Audit</span>
          <span style="font-size: 8px; color: #475569; font-weight: 700;">Timesheet Log</span>
        </div>
        <table>
          <thead><tr>${tsHeaderHtml}</tr></thead>
          <tbody>${tsRowsHtml}</tbody>
        </table>

        <div class="section-title">
          <span>3. Leave Requests &amp; Absences in Period</span>
          <span style="font-size: 8px; color: #475569; font-weight: 700;">Authorized Leave</span>
        </div>
        ${leaveRowsHtml}

        <div class="signoff-grid">
          <div class="sign-box">
            <div class="sign-title">Employee Acknowledgment</div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 2px;">I confirm that the hours worked and leave days logged above represent my true and accurate attendance for this period.</div>
            <div class="sign-line"></div>
            <div class="sign-date">Signature &amp; Date: ____________________________________</div>
          </div>
          <div class="sign-box">
            <div class="sign-title">Supervisor / Payroll Sign-off</div>
            <div style="font-size: 7.5px; color: #64748b; margin-top: 2px;">Audited and approved for company payroll and statutory BCEA compliance processing.</div>
            <div class="sign-line"></div>
            <div class="sign-date">Signature &amp; Date: ____________________________________</div>
          </div>
        </div>

        <div class="footer">
          <span>ClockWise People · Automated Time &amp; Leave Audit Statement</span>
          <span>BCEA &amp; Statutory Compliant Payroll Record</span>
        </div>
      </body>
    </html>
  `;

  triggerPrintHtml(html);
}


export type CompleteAuditPackData = {
  companyName: string;
  periodLabel: string;
  metadata: Record<string, string | number>;
  timesheets: {
    headers: string[];
    rows: Array<Array<string | number | boolean | null | undefined>>;
  };
  attendance: {
    headers: string[];
    rows: Array<Array<string | number | boolean | null | undefined>>;
  };
  accruals: {
    headers: string[];
    rows: Array<Array<string | number | boolean | null | undefined>>;
  };
  absences: {
    headers: string[];
    rows: Array<Array<string | number | boolean | null | undefined>>;
  };
};

export async function exportCompleteAuditPackExcel(
  pack: CompleteAuditPackData,
  filename: string,
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  // Helper to build a styled sheet
  const appendSheet = (
    sheetTitle: string,
    sheetName: string,
    headers: string[],
    rows: Array<Array<string | number | boolean | null | undefined>>,
  ) => {
    const dataMatrix: Array<Array<string | number | boolean | null | undefined>> = [
      [sheetTitle.toUpperCase()],
      [`Company: ${pack.companyName}`, `Period: ${pack.periodLabel}`, `Generated: ${new Date().toLocaleString("en-ZA")}`],
      [],
      headers,
      ...rows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(dataMatrix);

    const colWidths = headers.map((h, i) => {
      let max = h.length;
      for (const r of rows) {
        const cellLen = String(r[i] ?? "").length;
        if (cellLen > max) max = cellLen;
      }
      return { wch: Math.min(45, Math.max(12, max + 3)) };
    });
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  // 1. Summary Sheet
  const summaryRows: Array<Array<string | number | boolean | null | undefined>> = [
    ["CLOCKWISE PEOPLE - COMPLETE AUDIT & PAYROLL REPORT PACK"],
    [`Company: ${pack.companyName}`],
    [`Payroll Cycle: ${pack.periodLabel}`],
    [`Generated: ${new Date().toLocaleString("en-ZA")}`],
    [],
    ["EXECUTIVE METRICS", "VALUE"],
  ];
  for (const [k, v] of Object.entries(pack.metadata)) {
    summaryRows.push([k, v]);
  }
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // 2. Timesheets Sheet
  appendSheet(
    "Timesheet & Shift Payroll Audit",
    "Timesheets",
    pack.timesheets.headers,
    pack.timesheets.rows,
  );

  // 3. Attendance Sheet
  appendSheet(
    "Attendance & Punctuality Report",
    "Attendance",
    pack.attendance.headers,
    pack.attendance.rows,
  );

  // 4. Accruals Sheet
  appendSheet(
    "Leave Accrual & Balance Ledger",
    "Leave_Accruals",
    pack.accruals.headers,
    pack.accruals.rows,
  );

  // 5. Absences Sheet
  appendSheet(
    "Absence & Leave Logs",
    "Absence_Logs",
    pack.absences.headers,
    pack.absences.rows,
  );

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
