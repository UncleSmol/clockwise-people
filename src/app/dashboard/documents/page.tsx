import { redirect } from "next/navigation";

export default async function DocumentsPage() {
  redirect("/dashboard?panel=policies");
}
