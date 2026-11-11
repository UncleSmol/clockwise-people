import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE credentials in environment");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TALANE_COMPANY_ID = "be6a1fb3-2cac-4cf8-b01b-b1339ee07095";
const LEAVE_TYPE_IDS = {
  Sick: "454a2338-c633-4372-a056-e6ec17bc7993", // Sick Leave
  Annual: "0b4a0f75-d260-4d0d-9f36-c7b4c9e3d012", // Annual Leave
  FRL: "76dccf6b-a6ac-46a9-8e69-9003b6359039", // Family Responsibility Leave
  Maternity: "f39ba622-a5a7-4293-ad5a-636386448485", // Maternity Leave
};
const LEGACY_DUPLICATE_FRL_ID = "61ef2844-b15b-432f-9ebf-17d47e2692b6";

function normalize(val) {
  return String(val || "").toLowerCase().trim();
}

async function main() {
  const csvPath = path.join(
    process.cwd(),
    "workforce-clockins",
    "Talane & Associates",
    "talaneassociates_pto_balances_2026-11-11.csv",
  );

  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found at:", csvPath);
    process.exit(1);
  }

  const rawText = fs.readFileSync(csvPath, "utf8").trim();
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Locate header row starting with fname;lname;username
  const headerIdx = lines.findIndex((l) => l.toLowerCase().startsWith("fname;"));
  if (headerIdx === -1) {
    console.error("Could not find 'fname;lname;username;...' header row in CSV.");
    process.exit(1);
  }

  const headers = lines[headerIdx].split(";").map((h) => h.trim());
  const dataLines = lines.slice(headerIdx + 1);

  const parsedRows = dataLines.map((line) => {
    const parts = line.split(";");
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (parts[idx] ?? "").trim();
    });
    return obj;
  });

  console.log(`Parsed ${parsedRows.length} employee rows from PTO CSV.`);

  // Fetch company employees & approved leave requests
  const [{ data: employees, error: empErr }, { data: reqs, error: reqErr }] =
    await Promise.all([
      admin
        .from("employees")
        .select("id, full_name, email, employee_number, employment_status")
        .eq("company_id", TALANE_COMPANY_ID)
        .is("deleted_at", null),
      admin
        .from("leave_requests")
        .select("employee_id, leave_type_id, total_hours")
        .eq("company_id", TALANE_COMPANY_ID)
        .eq("status", "approved")
        .is("deleted_at", null),
    ]);

  if (empErr) throw empErr;
  if (reqErr) throw reqErr;

  // Build taken hours map from newly migrated approved leave_requests
  const takenMap = new Map();
  for (const r of reqs || []) {
    const ltId =
      r.leave_type_id === LEGACY_DUPLICATE_FRL_ID
        ? LEAVE_TYPE_IDS.FRL
        : r.leave_type_id;
    const key = `${r.employee_id}__${ltId}`;
    takenMap.set(key, Number(((takenMap.get(key) || 0) + Number(r.total_hours || 0)).toFixed(2)));
  }

  const empByEmail = new Map();
  for (const e of employees || []) {
    if (e.email) empByEmail.set(normalize(e.email), e);
  }

  const findEmployee = (row) => {
    const uname = normalize(row.username);
    if (uname && empByEmail.has(uname)) {
      return empByEmail.get(uname);
    }
    const fname = normalize(row.fname);
    const lname = normalize(row.lname);
    // Match both fname and lname tokens against full_name
    return (employees || []).find((e) => {
      const full = normalize(e.full_name);
      return full.includes(fname) && full.includes(lname);
    });
  };

  const today = "2026-11-11";
  const nowIso = new Date().toISOString();
  const upserts = [];
  const matchedNames = [];
  const skipped = [];

  for (const row of parsedRows) {
    const emp = findEmployee(row);
    if (!emp) {
      skipped.push(`${row.fname} ${row.lname} (${row.username})`);
      continue;
    }

    matchedNames.push(`${row.fname} ${row.lname} -> ${emp.full_name} (${emp.email})`);

    for (const [colName, leaveTypeId] of Object.entries(LEAVE_TYPE_IDS)) {
      const sheetBalance = Math.max(0, Number(Number(row[colName] || 0).toFixed(2)));
      const takenHours = takenMap.get(`${emp.id}__${leaveTypeId}`) || 0;
      const accruedHours = Number((sheetBalance + takenHours).toFixed(2));

      upserts.push({
        company_id: TALANE_COMPANY_ID,
        employee_id: emp.id,
        leave_type_id: leaveTypeId,
        balance_hours: sheetBalance,
        accrued_hours: accruedHours,
        taken_hours: takenHours,
        adjusted_hours: 0,
        as_of_date: today,
        updated_at: nowIso,
      });
    }
  }

  console.log(`Matched ${matchedNames.length} employees (${upserts.length} leave_balance rows).`);
  if (skipped.length > 0) {
    console.log("Skipped unmatched rows (not in Talane & Associates employees table):", skipped);
  }

  // Upsert in chunks
  const { error: upErr } = await admin
    .from("leave_balances")
    .upsert(upserts, { onConflict: "company_id,employee_id,leave_type_id" });

  if (upErr) {
    console.error("Failed to upsert leave_balances:", upErr);
    process.exit(1);
  }

  // Remove stale duplicate 'FRL' (61ef2844...) leave_balance row if present so FRL isn't double-counted
  const { data: deletedDupes, error: delErr } = await admin
    .from("leave_balances")
    .delete()
    .eq("company_id", TALANE_COMPANY_ID)
    .eq("leave_type_id", LEGACY_DUPLICATE_FRL_ID)
    .select("id");

  if (delErr) {
    console.warn("Warning deleting stale duplicate FRL balance row:", delErr.message);
  } else {
    console.log(`Removed ${deletedDupes?.length || 0} stale duplicate FRL balance row(s).`);
  }

  // Verification readout
  const { data: verifyRows } = await admin
    .from("leave_balances")
    .select("employee_id, leave_type_id, balance_hours, accrued_hours, taken_hours, adjusted_hours")
    .eq("company_id", TALANE_COMPANY_ID)
    .in("leave_type_id", Object.values(LEAVE_TYPE_IDS));

  console.log(`Verification: ${verifyRows?.length || 0} rows now stored across Sick, Annual, FRL, and Maternity for Talane & Associates.`);
  for (const mName of matchedNames) {
    console.log("  ✓", mName);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
