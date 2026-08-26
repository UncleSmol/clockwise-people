import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

export function exportReportToExcel(
  reportTitle: string,
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  metadata?: Record<string, string | number>,
) {
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
  const doc = new jsPDF({
    orientation: headers.length > 7 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 24, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(companyName.toUpperCase(), 14, 10);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(`${reportTitle} · Payroll Period: ${periodLabel}`, 14, 17);

  const generatedDate = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  doc.setFontSize(8);
  doc.text(`Generated: ${generatedDate}`, pageWidth - 14, 17, { align: "right" });

  let startY = 32;

  // KPI Highlights Strip (if provided)
  if (kpis && kpis.length > 0) {
    const kpiCount = kpis.length;
    const cardWidth = (pageWidth - 28 - (kpiCount - 1) * 4) / kpiCount;

    kpis.forEach((kpi, idx) => {
      const cardX = 14 + idx * (cardWidth + 4);
      doc.setFillColor(248, 250, 252); // Slate 50
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.roundedRect(cardX, startY, cardWidth, 14, 2, 2, "FD");

      doc.setTextColor(100, 116, 139); // Slate 500
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text(kpi.label.toUpperCase(), cardX + 3, startY + 5);

      doc.setTextColor(15, 23, 42); // Slate 900
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(String(kpi.value), cardX + 3, startY + 11);
    });

    startY += 20;
  }

  // Format table rows
  const cleanRows = rows.map((r) =>
    r.map((cell) => (cell === null || cell === undefined ? "--" : String(cell))),
  );

  // AutoTable Render
  autoTable(doc, {
    head: [headers],
    body: cleanRows,
    startY,
    margin: { horizontal: 14 },
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Footer page number
      const str = `Page ${doc.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, {
        align: "right",
      });
      doc.text("ClockWise People Automated Compliance Report", 14, doc.internal.pageSize.getHeight() - 8);
    },
  });

  doc.save(`${filename}.pdf`);
}
