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
  const printWindow = window.open("", "_blank");

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
        <title>${filename}</title>
        <style>
          @page {
            size: A4 ${isLandscape ? "landscape" : "portrait"};
            margin: 10mm;
          }
          * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          body { margin: 0; padding: 0; color: #0f172a; background: #fff; }
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
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 250);
          };
        </script>
      </body>
    </html>
  `;

  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    window.print();
  }
}
