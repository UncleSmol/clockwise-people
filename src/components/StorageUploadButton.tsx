"use client";

import { CheckCircle2, ExternalLink, FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { uploadFileToStorage, type UploadFolder } from "@/lib/uploads";

type StorageUploadButtonProps = {
  accept: string;
  folder: UploadFolder;
  hint?: string;
  currentUrl?: string | null;
  label?: string;
  variant?: "button" | "dropzone";
  onUploaded: (publicUrl: string) => void;
  onClear?: () => void;
};

export default function StorageUploadButton({
  accept,
  folder,
  hint,
  currentUrl,
  label = "Upload file",
  variant = "button",
  onUploaded,
  onClear,
}: StorageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  const isImage = currentUrl && /\.(jpg|jpeg|png|webp)($|\?)/i.test(currentUrl);

  if (variant === "dropzone") {
    return (
      <div className="grid w-full min-w-0 max-w-full gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        {currentUrl ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUrl}
                  alt="Uploaded document preview"
                  className="size-16 shrink-0 rounded-xl object-cover border border-emerald-500/30 shadow-2xs"
                />
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <FileText className="size-7" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs font-black text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Uploaded to Cloud Storage</span>
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:text-emerald-100">
                    {isImage ? "Image" : "Document"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted truncate max-w-xs sm:max-w-md font-mono">
                  {currentUrl.split("/").pop() ?? "attachment"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground hover:bg-surface-muted transition shadow-2xs"
              >
                <ExternalLink className="size-3.5" />
                <span>Preview</span>
              </a>

              {onClear ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 transition cursor-pointer shadow-2xs"
                >
                  <Trash2 className="size-3.5" />
                  <span>Remove</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/60 hover:bg-surface-muted/40 bg-surface"
            } ${busy ? "opacity-70 pointer-events-none" : ""}`}
          >
            {busy ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-7 animate-spin text-primary" />
                <p className="text-xs font-bold text-foreground">Uploading to Supabase Storage...</p>
                <p className="text-[11px] text-muted">Validating magic bytes and security signature...</p>
              </div>
            ) : (
              <>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                  <ImageIcon className="size-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Click to upload image or drag &amp; drop
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    Medical Certificates, Doctor&apos;s Notes, or Proof (Images: JPG, PNG, WebP, or PDF)
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {hint ? <p className="text-[11px] text-muted break-words">{hint}</p> : null}
        {error ? <p className="text-xs font-semibold text-danger break-words">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0 max-w-full gap-1">
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
        className="inline-flex h-11 w-full min-w-0 max-w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-bold text-foreground shadow-soft hover:bg-surface-muted transition-colors cursor-pointer disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin shrink-0" /> : <Upload className="size-4 shrink-0" />}
        <span>{busy ? "Uploading..." : label}</span>
      </button>
      {hint ? <p className="text-xs text-muted break-words">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-danger break-words">{error}</p> : null}
    </div>
  );
}