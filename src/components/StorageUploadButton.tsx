"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { uploadFileToStorage, type UploadFolder } from "@/lib/uploads";

type StorageUploadButtonProps = {
  accept: string;
  folder: UploadFolder;
  hint?: string;
  onUploaded: (publicUrl: string) => void;
};

export default function StorageUploadButton({
  accept,
  folder,
  hint,
  onUploaded,
}: StorageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const publicUrl = await uploadFileToStorage(folder, file);
      onUploaded(publicUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="grid gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground disabled:opacity-60"
      >
        <Upload className="size-4 shrink-0" />
        {busy ? "Uploading..." : "Upload file"}
      </button>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}