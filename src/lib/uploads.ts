"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export const attachmentsBucket =
  process.env.NEXT_PUBLIC_SUPABASE_ATTACHMENTS_BUCKET ?? "attachmnets";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type UploadFolder = "avatar" | "logo" | "attachment";

function safeFileName(name: string) {
  const base = name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 40);
  return base || "file";
}

export async function uploadFileToStorage(folder: UploadFolder, file: File) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Keep the file under 5 MB.");
  }

  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sign in to upload files.");
  }

  const path = `${user.id}/${folder}/${Date.now()}-${safeFileName(file.name)}`;

  const { error } = await supabase.storage
    .from(attachmentsBucket)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  const { data: publicObject } = supabase.storage
    .from(attachmentsBucket)
    .getPublicUrl(path);

  return publicObject.publicUrl;
}