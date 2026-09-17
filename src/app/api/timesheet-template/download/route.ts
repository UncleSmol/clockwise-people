import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  try {
    const userTemplatePath = path.join(
      process.cwd(),
      "workforce-clockins",
      "ClockWise_Import.xlsx",
    );
    const fallbackTemplatePath = path.join(
      process.cwd(),
      "workforce-clockins",
      "clockwise_timesheets_template_with_leave.xlsx",
    );

    const templatePath = fs.existsSync(userTemplatePath)
      ? userTemplatePath
      : fallbackTemplatePath;

    if (!fs.existsSync(templatePath)) {
      return new NextResponse("Template file not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(templatePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="clockwise_timesheets_template.xlsx"',
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error serving timesheet template:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
