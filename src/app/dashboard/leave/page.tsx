import { redirect } from "next/navigation";

export default async function LeavePage() {
  redirect("/dashboard?panel=leave");
}
