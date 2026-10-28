import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env", "utf8");
const env = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateCompanyRules() {
  console.log("Updating leave rules for Formalize, Talane, and Alora Dental...");

  // 1. Formalize (S AND S KEMISTRY): Cap 144h, accrue based on hours worked
  const formalizeId = "c096fb54-7018-43cb-8a4d-72f67004c785";
  const { error: formErr } = await supabase
    .from("leave_types")
    .update({
      accrual_rules: {
        yearly_hours: 144,
        entitlement_days: 18,
        annual_cap_hours: 144,
        accrual_mode: "hours_worked",
        bcea_section: "20"
      },
      updated_at: new Date().toISOString()
    })
    .eq("company_id", formalizeId)
    .eq("category", "annual");

  if (formErr) console.error("Error updating Formalize leave type:", formErr);
  else console.log("✓ Formalize: Annual leave set to 144h cap, accrual on hours worked.");

  // Also update company settings for Formalize
  await supabase
    .from("company_settings")
    .update({
      leave_rules: {
        annual_leave_cap_hours: 144,
        accrue_on_depleted: true,
      },
      updated_at: new Date().toISOString()
    })
    .eq("company_id", formalizeId);

  // 2. Talane (TALANE AND ASSOCIATES): 21 days
  const talaneId = "be6a1fb3-2cac-4cf8-b01b-b1339ee07095";
  const { error: talErr } = await supabase
    .from("leave_types")
    .update({
      accrual_rules: {
        yearly_hours: 168,
        entitlement_days: 21,
        accrual_mode: "worked_hours",
        bcea_section: "20"
      },
      updated_at: new Date().toISOString()
    })
    .eq("company_id", talaneId)
    .eq("category", "annual");

  if (talErr) console.error("Error updating Talane leave type:", talErr);
  else console.log("✓ Talane: Annual leave set to 21 days (168h).");

  // 3. Alora Dental (Alora Dental Care): 17 days
  const aloraId = "ce43d3b4-494d-401d-8476-3168465dbc71";
  const { error: aloraErr } = await supabase
    .from("leave_types")
    .update({
      accrual_rules: {
        yearly_hours: 136,
        entitlement_days: 17,
        accrual_mode: "worked_hours",
        bcea_section: "20"
      },
      updated_at: new Date().toISOString()
    })
    .eq("company_id", aloraId)
    .eq("category", "annual");

  if (aloraErr) console.error("Error updating Alora Dental leave type:", aloraErr);
  else console.log("✓ Alora Dental: Annual leave set to 17 days (136h).");
}

updateCompanyRules();
