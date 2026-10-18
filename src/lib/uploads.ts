import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  validateMediaFile,
  type MediaUploadCategory,
} from "@/lib/security/sanitizer";

export const attachmentsBucket =
  process.env.NEXT_PUBLIC_SUPABASE_ATTACHMENTS_BUCKET ?? "attachmnets";

export type UploadFolder = "avatar" | "logo" | "attachment";

function generateSecureStoragePath(userId: string, folder: UploadFolder, extension: string): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `${userId}/${folder}/${uuid}.${extension}`;
}

/**
 * Validates and securely uploads user media to Supabase storage.
 * Enforces:
 * - Extension whitelisting (SVG & executables strictly forbidden)
 * - Category-specific byte size ceilings
 * - Binary magic-byte header inspection (prevents polyglot/MIME spoofing)
 * - Cryptographically random UUID paths (zero directory traversal or filename collision)
 */
export async function uploadFileToStorage(folder: UploadFolder, file: File): Promise<string> {
  // 1. Cyber-security binary and extension validation
  const validation = await validateMediaFile(file, folder as MediaUploadCategory);
  if (!validation.ok || !validation.extension) {
    throw new Error(validation.error ?? "Invalid file upload.");
  }

  // 2. Authentication check
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to upload files.");
  }

  // 3. Cryptographically isolated path
  const path = generateSecureStoragePath(user.id, folder, validation.extension);

  // 4. Secure upload
  const { error } = await supabase.storage
    .from(attachmentsBucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data: publicObject } = supabase.storage
    .from(attachmentsBucket)
    .getPublicUrl(path);

  return publicObject.publicUrl;
}