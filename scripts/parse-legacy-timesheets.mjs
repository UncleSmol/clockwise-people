import fs from 'node:fs';
import path from 'node:path';

const CSV_DIR = 'workforce-clockins';
const OUTPUT_DIR = 'workforce-clockins/migrations';
const COMPANY_ID = 'c096fb54-7018-43cb-8a4d-72f67004c785';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseDateTime(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\w+)\s+(\d+),?\s+(\d+):(\d+)([ap]m)/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
  if (!month) return null;
  const day = parseInt(m[2]);
  let hour = parseInt(m[3]);
  const min = parseInt(m[4]);
  if (m[5].toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (m[5].toLowerCase() === 'am' && hour === 12) hour = 0;
  return { month, day, year: null, hour, minute: min };
}

function resolveYear(parsed, refYear, refMonth) {
  if (!parsed) return null;
  let y = refYear;
  if (parsed.month === 12 && refMonth === 1) y = refYear - 1;
  if (parsed.month === 1 && refMonth === 12) y = refYear + 1;
  return { ...parsed, year: y };
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDateStr(p) {
  if (!p || !p.year) return null;
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function toTimeStr(p) {
  if (!p) return null;
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

const RE = {
  timeOff: /\(time_off_request\)\s+Added new (\d+):(\d+) hour timesheet for (\S+) on (\d{4}-\d{2}-\d{2})/i,

  apiCreate: /\(api\)\s+Created new timesheet id:(\d+) for (\S+)\.\s+Clocked into job-code:\s+(.+?)\s+Clock-in:\s+(.+?)(?:\s*\/\s*Clock-out\s+(.+?))?\s*\.\s+Total time:\s+(.+?)$/i,

  apiClockOut: /\(api\)\s+Update detail:\s+Employee has been clocked-out at\s+"(.+?)"\s+Total time:\s+(.+?)$/i,

  apiChange: /\(api\)\s+Update detail:\s+Changed (clock-in|clock-out) time from\s+"([^"]+?) \([\d:]+\)"\s+to\s+"([^"]+?) \([\d:]+\)"/i,

  apiTotalChange: /\(api\)\s+Update detail:\s+Total time worked changed from/i,

  msgqClockOut: /\(msgq\)\s+Employee has been clocked-out at\s+(.+?)\s+\(rounded/i,

  msgqCreate: /\(msgq\)\s+Created new timesheet for\s+(\S+)\.\s+Clock-in:\s+(.+?)\.\s+Customer:\s+(.+?)\s+\(rounded/i,

  msgqClockingOut: /\(msgq\)\s+Clocking out:\s+(\S+),\s+switching to job code:\s+(.+)/i,

  splitting: /Splitting\s+(\S+)'s timesheet at\s+(.+?)\.\s+Details to follow\./i,

  splitDetailFirst: /split detail:\s+first-half clocked-out at\s+(\w+ \d+, \d+:\d+[ap]m),\s+shift total:/i,

  splitDetailNew: /split detail:\s+new timesheet created during timesheet split\.\s+Clock-in time:\s+(\w+ \d+, \d+:\d+[ap]m),\s+shift total:/i,

  deletion: /Deleting timesheet id:\s*(\d+)\.\s+Employee:\s+(\S+)/i,
};

function extractYearFromFile(filename) {
  const m = filename.match(/(\d{4})-\d{2}-\d{2}/);
  return m ? parseInt(m[1]) : 2026;
}

function processAllFiles() {
  const timesheets = new Map();
  const timeOffEntries = [];

  const files = fs.readdirSync(CSV_DIR)
    .filter(f => f.endsWith('.csv'))
    .sort();

  for (const file of files) {
    const csvYear = extractYearFromFile(file);
    const content = fs.readFileSync(path.join(CSV_DIR, file), 'utf-8');
    const lines = content.trim().split('\n');

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;
      const f = parseCSVLine(row);
      if (f.length < 11) continue;

      const [
        id, gmtTimestamp, localTimestamp,
        userId, username,
        tsUserId, tsUsername,
        tsId, type, ip, message,
      ] = f;

      const gmtMatch = gmtTimestamp.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      const gmtYear = gmtMatch ? parseInt(gmtMatch[1]) : csvYear;
      const gmtMonth = gmtMatch ? parseInt(gmtMatch[2]) : 1;

      processMessage({
        tsId, tsUsername, message, type,
        gmtYear, gmtMonth, csvYear,
      }, timesheets, timeOffEntries);
    }
  }

  return { timesheets, timeOffEntries };
}

function processMessage(row, timesheets, timeOffEntries) {
  const { tsId, tsUsername, message, type, gmtYear, gmtMonth } = row;

  if (!message) return;

  const timeOffMatch = message.match(RE.timeOff);
  if (timeOffMatch) {
    const [, hoursStr, minsStr, email, date] = timeOffMatch;
    const hours = parseInt(hoursStr) + parseInt(minsStr) / 60;
    timeOffEntries.push({ email: email.toLowerCase(), date, hours });
    return;
  }

  const apiCreateMatch = message.match(RE.apiCreate);
  if (apiCreateMatch) {
    const [, id, email, jobCode, clockInStr, clockOutStr, totalTime] = apiCreateMatch;
    const ci = parseDateTime(clockInStr);
    const co = clockOutStr ? parseDateTime(clockOutStr) : null;
    const resolvedCi = resolveYear(ci, gmtYear, gmtMonth);
    const resolvedCo = resolveYear(co, gmtYear, gmtMonth);
    timesheets.set(id, {
      tsId: id,
      email: email.toLowerCase(),
      jobCode: jobCode.trim(),
      clockIn: resolvedCi,
      clockOut: resolvedCo,
      totalTime: totalTime.trim(),
      deleted: false,
      source: 'api',
    });
    return;
  }

  const apiClockOutMatch = message.match(RE.apiClockOut);
  if (apiClockOutMatch) {
    const [, clockOutStr, totalTime] = apiClockOutMatch;
    const co = parseDateTime(clockOutStr);
    const resolvedCo = resolveYear(co, gmtYear, gmtMonth);
    if (tsId && timesheets.has(tsId)) {
      const ts = timesheets.get(tsId);
      ts.clockOut = resolvedCo;
      ts.totalTime = totalTime.trim();
    }
    return;
  }

  const apiChangeMatch = message.match(RE.apiChange);
  if (apiChangeMatch) {
    const [, field, , newTimeStr] = apiChangeMatch;
    const nt = parseDateTime(newTimeStr);
    const resolvedNt = resolveYear(nt, gmtYear, gmtMonth);
    if (tsId && timesheets.has(tsId)) {
      const ts = timesheets.get(tsId);
      if (field === 'clock-in') ts.clockIn = resolvedNt;
      if (field === 'clock-out') ts.clockOut = resolvedNt;
      timesheets.set(tsId, ts);
    }
    return;
  }

  if (message.match(RE.apiTotalChange)) {
    return;
  }

  const msgqClockOutMatch = message.match(RE.msgqClockOut);
  if (msgqClockOutMatch) {
    const [, clockOutStr] = msgqClockOutMatch;
    const co = parseDateTime(clockOutStr);
    const resolvedCo = resolveYear(co, gmtYear, gmtMonth);
    if (tsId && timesheets.has(tsId)) {
      const ts = timesheets.get(tsId);
      if (!ts.clockOut || ts.source !== 'api') {
        ts.clockOut = resolvedCo;
      }
    }
    return;
  }

  const msgqCreateMatch = message.match(RE.msgqCreate);
  if (msgqCreateMatch) {
    const [, email, clockInStr, jobCode] = msgqCreateMatch;
    const ci = parseDateTime(clockInStr);
    const resolvedCi = resolveYear(ci, gmtYear, gmtMonth);
    if (tsId && !timesheets.has(tsId)) {
      timesheets.set(tsId, {
        tsId,
        email: email.toLowerCase(),
        jobCode: jobCode.trim(),
        clockIn: resolvedCi,
        clockOut: null,
        totalTime: null,
        deleted: false,
        source: 'msgq',
      });
    }
    return;
  }

  const deletionMatch = message.match(RE.deletion);
  if (deletionMatch) {
    const [, deletedId] = deletionMatch;
    if (timesheets.has(deletedId)) {
      timesheets.get(deletedId).deleted = true;
    }
    return;
  }

  const splitNewMatch = message.match(RE.splitDetailNew);
  if (splitNewMatch) {
    const [, clockInStr] = splitNewMatch;
    const ci = parseDateTime(clockInStr);
    const resolvedCi = resolveYear(ci, gmtYear, gmtMonth);
    if (!timesheets.has(tsId)) {
      timesheets.set(tsId, {
        tsId,
        email: tsUsername.toLowerCase(),
        jobCode: 'General Work',
        clockIn: resolvedCi,
        clockOut: null,
        totalTime: null,
        deleted: false,
        source: 'split',
      });
    }
    return;
  }

  const splitFirstMatch = message.match(RE.splitDetailFirst);
  if (splitFirstMatch) {
    const [, clockOutStr] = splitFirstMatch;
    const co = parseDateTime(clockOutStr);
    const resolvedCo = resolveYear(co, gmtYear, gmtMonth);
    if (tsId && timesheets.has(tsId) && !timesheets.get(tsId).clockOut) {
      timesheets.get(tsId).clockOut = resolvedCo;
    }
    return;
  }
}

function buildDailyRecords(timesheets, timeOffEntries) {
  const employeeDays = new Map();

  for (const ts of timesheets.values()) {
    if (ts.deleted) continue;
    if (!ts.clockIn) continue;
    const date = toDateStr(ts.clockIn);
    if (!date) continue;

    if (!employeeDays.has(ts.email)) {
      employeeDays.set(ts.email, new Map());
    }
    const days = employeeDays.get(ts.email);

    if (!days.has(date)) {
      days.set(date, {
        date,
        clockInBlocks: [],
        lunchIn: null,
        lunchOut: null,
      });
    }
    const day = days.get(date);

    if (ts.jobCode.toLowerCase().includes('lunch')) {
      if (ts.clockIn && (!day.lunchIn || ts.clockIn.hour < day.lunchIn.hour ||
          (ts.clockIn.hour === day.lunchIn.hour && ts.clockIn.minute < day.lunchIn.minute))) {
        day.lunchIn = ts.clockIn;
      }
      if (ts.clockOut && (!day.lunchOut || ts.clockOut.hour > day.lunchOut.hour ||
          (ts.clockOut.hour === day.lunchOut.hour && ts.clockOut.minute > day.lunchOut.minute))) {
        day.lunchOut = ts.clockOut;
      }
    } else {
      day.clockInBlocks.push({ in: ts.clockIn, out: ts.clockOut, complete: !!ts.clockOut });
    }
  }

  const timeOffByEmployee = new Map();
  for (const to of timeOffEntries) {
    if (!timeOffByEmployee.has(to.email)) {
      timeOffByEmployee.set(to.email, new Map());
    }
    const emp = timeOffByEmployee.get(to.email);
    emp.set(to.date, (emp.get(to.date) || 0) + to.hours);
  }

  const result = [];

  for (const [email, days] of employeeDays) {
    const empRecords = [];
    const sortedDates = [...days.keys()].sort();

    for (const date of sortedDates) {
      const day = days.get(date);
      if (day.clockInBlocks.length === 0) continue;

      day.clockInBlocks.sort((a, b) =>
        a.in.hour !== b.in.hour ? a.in.hour - b.in.hour : a.in.minute - b.in.minute
      );

      const clockIn = day.clockInBlocks[0].in;
      const lastBlock = day.clockInBlocks[day.clockInBlocks.length - 1];
      let clockOut = lastBlock.out;

      let isSaturday = false;
      if (clockIn.year && clockIn.month && clockIn.day) {
        const d = new Date(clockIn.year, clockIn.month - 1, clockIn.day);
        isSaturday = d.getDay() === 6;
      }

      let missingClockOut = false;
      if (!clockOut) {
        const defaultHour = isSaturday ? 13 : 17;
        const refDay = day.clockInBlocks.find(b => b.out) || day.clockInBlocks[0];
        clockOut = {
          year: refDay.in.year,
          month: refDay.in.month,
          day: refDay.in.day,
          hour: defaultHour,
          minute: 0,
        };
        missingClockOut = true;
      }

      const lunchIn = day.lunchIn;
      const lunchOut = day.lunchOut;

      const timeOffHours = timeOffByEmployee.get(email)?.get(date) || 0;

      const status = missingClockOut ? 'draft' : 'approved';

      empRecords.push({
        date,
        clockIn: toTimeStr(clockIn),
        lunchStart: lunchIn ? toTimeStr(lunchIn) : null,
        lunchEnd: lunchOut ? toTimeStr(lunchOut) : null,
        clockOut: toTimeStr(clockOut),
        status,
        timeOffHours,
        notes: timeOffHours > 0 ? `Includes ${timeOffHours}h time-off from legacy system` : null,
      });
    }

    if (empRecords.length > 0) {
      result.push({ email, records: empRecords });
    }
  }

  for (const [email, dates] of timeOffByEmployee) {
    const existingEmp = result.find(r => r.email === email);
    const existingDates = existingEmp ? new Set(existingEmp.records.map(r => r.date)) : new Set();

    for (const [date, hours] of dates) {
      if (existingDates.has(date)) continue;
      let existing = result.find(r => r.email === email);
      if (!existing) {
        existing = { email, records: [] };
        result.push(existing);
      }
      existing.records.push({
        date,
        clockIn: null,
        lunchStart: null,
        lunchEnd: null,
        clockOut: null,
        status: 'approved',
        timeOffHours: hours,
        notes: `Time-off: ${hours}h`,
      });
    }
  }

  for (const emp of result) {
    emp.records.sort((a, b) => a.date.localeCompare(b.date));
  }

  return result;
}

function pgQuote(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sanitizeEmail(email) {
  return email.replace(/[@.]/g, '_');
}

function generateSQL(email, records) {
  const lines = [];
  lines.push('-- ============================================================');
  lines.push(`-- Migration: Legacy timesheet data for ${email}`);
  lines.push(`-- Company ID: ${COMPANY_ID}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Records: ${records.length}`);
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');
  lines.push('DO $$');
  lines.push('DECLARE');
  lines.push('  v_company_id CONSTANT uuid := ' + pgQuote(COMPANY_ID) + ';');
  lines.push('  v_employee_id uuid;');
  lines.push('  v_timesheet_id uuid;');
  lines.push('BEGIN');
  lines.push('');
  lines.push('  -- Look up employee by email (case-insensitive)');
  lines.push('  SELECT id INTO v_employee_id');
  lines.push('  FROM public.employees');
  lines.push("  WHERE LOWER(email) = LOWER(" + pgQuote(email) + ")");
  lines.push('    AND company_id = v_company_id');
  lines.push('    AND deleted_at IS NULL;');
  lines.push('');
  lines.push('  IF v_employee_id IS NULL THEN');
  lines.push('    RAISE WARNING ' + pgQuote("Employee not found: " + email + " — skipping migration") + ';');
  lines.push('    RETURN;');
  lines.push('  END IF;');
  lines.push('');
  lines.push('  -- Create parent timesheet for migrated entries');
  lines.push("  INSERT INTO public.timesheets (company_id, employee_id, status, notes)");
  lines.push("  VALUES (v_company_id, v_employee_id, 'draft', 'Migrated from legacy time tracker')");
  lines.push('  RETURNING id INTO v_timesheet_id;');
  lines.push('');

  let entryIndex = 0;
  for (const rec of records) {
    const clockInVal = pgQuote(rec.clockIn);
    const lunchStartVal = pgQuote(rec.lunchStart);
    const lunchEndVal = pgQuote(rec.lunchEnd);
    const clockOutVal = pgQuote(rec.clockOut);
    const workDateVal = pgQuote(rec.date);
    const statusVal = pgQuote(rec.status);
    const notesVal = pgQuote(rec.notes);

    const isTimeOff = !rec.clockIn && rec.timeOffHours > 0;
    const hoursStr = isTimeOff ? rec.timeOffHours.toFixed(2) : '0';
    const grossStr = hoursStr;
    const paidStr = hoursStr;
    const normalStr = hoursStr;

    lines.push(`  -- Entry ${++entryIndex}: ${rec.date}${rec.clockIn ? ` ${rec.clockIn}-${rec.clockOut}` : ''}${rec.timeOffHours ? ` (${rec.timeOffHours}h)` : ''}`);
    lines.push('  INSERT INTO public.time_entries (');
    lines.push('    company_id, timesheet_id, employee_id, work_date,');
    lines.push('    clock_in, lunch_start, lunch_end, clock_out,');
    lines.push('    gross_hours, lunch_hours, paid_hours, normal_hours, overtime_hours,');
    lines.push('    missing_clocking, late_arrival, early_departure, status, notes');
    lines.push('  ) VALUES (');
    lines.push('    v_company_id, v_timesheet_id, v_employee_id, ' + workDateVal + ',');
    lines.push('    ' + clockInVal + ', ' + lunchStartVal + ', ' + lunchEndVal + ', ' + clockOutVal + ',');
    lines.push('    ' + grossStr + ', 0, ' + paidStr + ', ' + normalStr + ', 0,');
    lines.push('    false, false, false,');
    lines.push('    ' + statusVal + ',');
    lines.push('    ' + notesVal);
    lines.push('  );');
    lines.push('');
  }

  lines.push('END $$;');
  lines.push('');
  lines.push('COMMIT;');
  lines.push('');

  return lines.join('\n');
}

function main() {
  console.log('Parsing legacy timesheet CSV files...');
  const { timesheets, timeOffEntries } = processAllFiles();
  console.log(`Processed ${timesheets.size} timesheets (including msgq), ${timeOffEntries.length} time-off entries`);

  const activeTs = [...timesheets.values()].filter(ts => !ts.deleted && ts.clockIn);
  console.log(`Active timesheets with clock-in: ${activeTs.length}`);

  const employees = new Set();
  for (const ts of activeTs) employees.add(ts.email);
  for (const to of timeOffEntries) employees.add(to.email);
  console.log(`Unique employees: ${employees.size}`);
  console.log('Emails:', [...employees].join(', '));

  const dailyRecords = buildDailyRecords(timesheets, timeOffEntries);
  console.log(`\nDaily records per employee:`);
  let totalRecords = 0;
  for (const emp of dailyRecords) {
    console.log(`  ${emp.email}: ${emp.records.length} records`);
    totalRecords += emp.records.length;
  }
  console.log(`Total records: ${totalRecords}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const emp of dailyRecords) {
    const filename = sanitizeEmail(emp.email) + '.sql';
    const sql = generateSQL(emp.email, emp.records);
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), sql, 'utf-8');
    console.log(`  Wrote: ${OUTPUT_DIR}/${filename}`);
  }

  console.log('\nDone!');
}

main();
