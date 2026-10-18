/**
 * ClockWise People Enterprise Cyber Security & Input Sanitization Suite
 *
 * Implements defense-in-depth sanitization:
 * 1. Strict XSS mitigation (HTML entity encoding, tag neutralization)
 * 2. Control character & Unicode directional override stripping (spoofing / parser exploit prevention)
 * 3. Media & File Upload binary validation (MIME sniffing / Magic Bytes signatures)
 * 4. Path Traversal & Double-extension neutralization
 * 5. Server-Side Request Forgery (SSRF) protection with private IP/metadata blocklists
 * 6. CSV / Excel Formula Injection (CWE-1236) neutralization
 * 7. Prototype pollution & JSON bomb protection
 */

// Whitelist of allowed extensions per upload category
export const UPLOAD_WHITELIST = {
  avatar: ["jpg", "jpeg", "png", "webp"],
  logo: ["jpg", "jpeg", "png", "webp"],
  attachment: ["jpg", "jpeg", "png", "webp", "pdf"],
  spreadsheet: ["xlsx", "xls", "csv"],
} as const;

export type MediaUploadCategory = keyof typeof UPLOAD_WHITELIST;

export const MAX_FILE_SIZES: Record<MediaUploadCategory, number> = {
  avatar: 5 * 1024 * 1024,      // 5 MB
  logo: 5 * 1024 * 1024,        // 5 MB
  attachment: 10 * 1024 * 1024, // 10 MB
  spreadsheet: 20 * 1024 * 1024 // 20 MB
};

// Dangerous executable and script extensions that must never pass through under any circumstance
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "sh", "bash", "ps1", "vbs", "js", "mjs", "ts", "html", "htm",
  "xhtml", "xml", "svg", "php", "phtml", "py", "rb", "cgi", "pl", "jar", "war", "dll",
  "com", "scr", "msi", "bin", "iso", "apk", "app", "dmg"
]);

// Private and internal IP ranges to prevent SSRF
const SSRF_BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254", // Cloud instance metadata (AWS, GCP, Azure, DigitalOcean)
]);

/**
 * Strips ASCII control characters, null bytes, and Unicode directional overrides
 * (e.g. Right-To-Left Override U+202E, which disguises executable extensions).
 */
export function sanitizeString(
  input: unknown,
  maxLength = 255,
  options?: { allowNewlines?: boolean; trim?: boolean }
): string {
  if (input === null || input === undefined) return "";
  let str = String(input);

  // 1. Strip null bytes
  str = str.replace(/\0/g, "");

  // 2. Strip Unicode Directional Overrides & Invisible Characters (U+202A to U+202E, U+2066 to U+2069, U+200B-U+200D)
  str = str.replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, "");

  // 3. Strip control characters
  if (options?.allowNewlines) {
    // Keep \n, \r, \t, strip other C0/C1 control characters
    str = str.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
  } else {
    str = str.replace(/[\x00-\x1F\x7F-\x9F]/g, " ");
  }

  // 4. Trim if requested (default true)
  if (options?.trim !== false) {
    str = str.trim();
  }

  // 5. Enforce max length
  if (maxLength > 0 && str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  return str;
}

/**
 * Sanitizes multiline text inputs (notes, reasons, descriptions, addresses).
 */
export function sanitizeMultilineText(input: unknown, maxLength = 2000): string {
  return sanitizeString(input, maxLength, { allowNewlines: true, trim: true });
}

/**
 * Encodes dangerous characters to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(input: unknown): string {
  const str = sanitizeString(input, 0, { allowNewlines: true, trim: false });
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Strips all HTML/XML tags completely, leaving pure sanitized text.
 */
export function stripHtmlTags(input: unknown): string {
  const str = sanitizeString(input, 0, { allowNewlines: true, trim: false });
  return str.replace(/<[^>]*>?/gm, "");
}

/**
 * Sanitizes user search terms for safe database querying.
 */
export function sanitizeSearchQuery(query: unknown, maxLength = 80): string {
  let clean = sanitizeString(query, maxLength, { allowNewlines: false, trim: true });
  // Escape potential wildcard injection if used in SQL ILIKE
  clean = clean.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return clean;
}

/**
 * Neutralizes CSV/Excel formula injection (CWE-1236).
 * Any cell value starting with '=', '+', '-', '@', '\t', '\r', or '|' is prepended with a single quote.
 */
export function sanitizeSpreadsheetFormula(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value).trim();
  if (str.length === 0) return "";

  const firstChar = str[0];
  if (firstChar === "=" || firstChar === "+" || firstChar === "-" || firstChar === "@" || firstChar === "\t" || firstChar === "\r" || firstChar === "|") {
    str = `'${str}`;
  }
  return str;
}

/**
 * Validates and sanitizes HTTP/HTTPS URLs.
 * Strictly blocks 'javascript:', 'data:', 'vbscript:', 'file:', and SSRF target networks.
 */
export function sanitizeUrl(
  input: unknown,
  options?: {
    allowedProtocols?: string[];
    allowedHostnames?: string[];
    allowLocalhost?: boolean;
  }
): string | null {
  if (!input) return null;
  const raw = sanitizeString(input, 2048, { allowNewlines: false, trim: true });
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const allowedProtocols = options?.allowedProtocols ?? ["https:", "http:"];

    if (!allowedProtocols.includes(parsed.protocol.toLowerCase())) {
      return null;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check SSRF blocked hostnames unless explicitly allowed
    if (!options?.allowLocalhost) {
      if (SSRF_BLOCKED_HOSTNAMES.has(hostname)) {
        return null;
      }
      // Check private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
      if (
        /^127\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return null;
      }
    }

    // Check optional hostname whitelist
    if (options?.allowedHostnames && options.allowedHostnames.length > 0) {
      const isAllowedHost = options.allowedHostnames.some(
        (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
      );
      if (!isAllowedHost) {
        return null;
      }
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validates map URLs specifically to prevent SSRF against untrusted domains.
 */
export function sanitizeMapUrl(input: unknown): { ok: boolean; url?: string; error?: string } {
  const ALLOWED_MAP_DOMAINS = [
    "google.com",
    "maps.google.com",
    "goo.gl",
    "maps.app.goo.gl",
    "openstreetmap.org",
    "waze.com",
    "apple.com",
    "here.com",
    "bing.com",
  ];

  const sanitized = sanitizeUrl(input, {
    allowedProtocols: ["https:", "http:"],
    allowedHostnames: ALLOWED_MAP_DOMAINS,
    allowLocalhost: false,
  });

  if (!sanitized) {
    return {
      ok: false,
      error: "Invalid map URL. Only official Google Maps, Apple Maps, OpenStreetMap, or Waze links are supported.",
    };
  }

  return { ok: true, url: sanitized };
}

/**
 * Sanitizes an uploaded file name:
 * - Strips directory traversal (../, ..\)
 * - Strips all non-alphanumeric chars except safe dot, dash, underscore
 * - Extracts and validates extension
 */
export function sanitizeFileName(originalName: string): { safeName: string; extension: string } {
  // Strip path separators and traversal
  const baseName = originalName.replace(/[\/\\]/g, "").replace(/\.\./g, "");
  const parts = baseName.split(".");
  const rawExt = parts.length > 1 ? parts.pop()?.toLowerCase()?.trim() ?? "" : "";
  const nameBody = parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || "file";

  // Check double extensions with dangerous payload (e.g. invoice.php.png)
  if (parts.some((part) => DANGEROUS_EXTENSIONS.has(part.toLowerCase()))) {
    throw new Error("Dangerous file name detected. Multi-extension executables are blocked.");
  }

  const extension = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return {
    safeName: `${nameBody}.${extension}`,
    extension,
  };
}

/**
 * Checks binary magic bytes signatures to verify true file type and block disguised executables / scripts.
 */
export function verifyBinaryMagicBytes(
  headerBytes: Uint8Array,
  claimedExtension: string
): { isValid: boolean; detectedType?: string } {
  if (headerBytes.length < 4) {
    return { isValid: false };
  }

  // JPEG: FF D8 FF
  if (headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff) {
    return {
      isValid: claimedExtension === "jpg" || claimedExtension === "jpeg",
      detectedType: "jpeg",
    };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47
  ) {
    return {
      isValid: claimedExtension === "png",
      detectedType: "png",
    };
  }

  // WebP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    headerBytes.length >= 12 &&
    headerBytes[0] === 0x52 &&
    headerBytes[1] === 0x49 &&
    headerBytes[2] === 0x46 &&
    headerBytes[3] === 0x46 &&
    headerBytes[8] === 0x57 &&
    headerBytes[9] === 0x45 &&
    headerBytes[10] === 0x42 &&
    headerBytes[11] === 0x50
  ) {
    return {
      isValid: claimedExtension === "webp",
      detectedType: "webp",
    };
  }

  // PDF: %PDF- (25 50 44 46)
  if (
    headerBytes[0] === 0x25 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x44 &&
    headerBytes[3] === 0x46
  ) {
    return {
      isValid: claimedExtension === "pdf",
      detectedType: "pdf",
    };
  }

  // XLSX / Zip container: PK.. (50 4B 03 04)
  if (
    headerBytes[0] === 0x50 &&
    headerBytes[1] === 0x4b &&
    headerBytes[2] === 0x03 &&
    headerBytes[3] === 0x04
  ) {
    return {
      isValid: claimedExtension === "xlsx" || claimedExtension === "zip",
      detectedType: "xlsx",
    };
  }

  // Legacy XLS: OLE Compound Document (D0 CF 11 E0 A1 B1 1A E1)
  if (
    headerBytes[0] === 0xd0 &&
    headerBytes[1] === 0xcf &&
    headerBytes[2] === 0x11 &&
    headerBytes[3] === 0xe0
  ) {
    return {
      isValid: claimedExtension === "xls",
      detectedType: "xls",
    };
  }

  // CSV: Text format without binary executable headers
  if (claimedExtension === "csv") {
    // Ensure no binary nulls or executable magic headers (MZ, ELF, Mach-O)
    const isWindowsExecutable = headerBytes[0] === 0x4d && headerBytes[1] === 0x5a; // MZ
    const isElf = headerBytes[0] === 0x7f && headerBytes[1] === 0x45 && headerBytes[2] === 0x4c && headerBytes[3] === 0x46; // ELF
    const containsNulls = headerBytes.slice(0, 32).includes(0);

    if (isWindowsExecutable || isElf || containsNulls) {
      return { isValid: false };
    }

    return { isValid: true, detectedType: "csv" };
  }

  return { isValid: false };
}

/**
 * Comprehensive media file validation function for avatars, company logos, and leave attachments.
 */
export async function validateMediaFile(
  file: File | { name: string; size: number; type?: string; arrayBuffer: () => Promise<ArrayBuffer> },
  category: MediaUploadCategory
): Promise<{ ok: boolean; error?: string; safeFileName?: string; extension?: string }> {
  if (!file) {
    return { ok: false, error: "No file was provided." };
  }

  // 1. File size enforcement
  const maxBytes = MAX_FILE_SIZES[category];
  if (file.size <= 0) {
    return { ok: false, error: "The selected file is empty." };
  }
  if (file.size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `File size exceeds the limit of ${maxMb} MB.` };
  }

  // 2. File name & extension sanitization
  let extension: string;
  let safeName: string;
  try {
    const sanitized = sanitizeFileName(file.name);
    extension = sanitized.extension;
    safeName = sanitized.safeName;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid file name." };
  }

  // 3. Extension whitelist check
  const allowedExtensions: readonly string[] = UPLOAD_WHITELIST[category];
  if (!allowedExtensions.includes(extension)) {
    return {
      ok: false,
      error: `Unsupported file type (.${extension}). Allowed types: ${allowedExtensions.map((e) => `.${e}`).join(", ")}. Note: SVG and executable files are blocked for security.`,
    };
  }

  // 4. Binary Magic Bytes Verification
  try {
    const buffer = await file.arrayBuffer();
    const headerBytes = new Uint8Array(buffer.slice(0, 16));
    const magicCheck = verifyBinaryMagicBytes(headerBytes, extension);

    if (!magicCheck.isValid) {
      return {
        ok: false,
        error: `File signature mismatch: the file content does not match its .${extension} extension. Upload legitimate ${allowedExtensions.join("/")} files only.`,
      };
    }
  } catch {
    return { ok: false, error: "Failed to read and verify file headers." };
  }

  return {
    ok: true,
    safeFileName: safeName,
    extension,
  };
}

/**
 * Prototype pollution and JSON bomb safe JSON parser.
 */
export function safeJsonParse<T = Record<string, unknown>>(
  rawJson: string,
  maxDepth = 6,
  maxKeys = 300
): { ok: boolean; data?: T; error?: string } {
  if (!rawJson || typeof rawJson !== "string") {
    return { ok: false, error: "JSON input is required." };
  }

  if (rawJson.length > 50000) {
    return { ok: false, error: "JSON payload is too large (max 50 KB)." };
  }

  let parsed: unknown;
  try {
    // Prototype pollution prevention during parsing
    parsed = JSON.parse(rawJson, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return undefined;
      }
      return value;
    });
  } catch {
    return { ok: false, error: "Rules input must be valid JSON syntax." };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, error: "JSON must be a valid object." };
  }

  // Check depth and total keys recursively
  let keyCount = 0;
  function checkDepth(obj: unknown, currentDepth: number): boolean {
    if (currentDepth > maxDepth) return false;
    if (typeof obj === "object" && obj !== null) {
      for (const k of Object.keys(obj)) {
        keyCount++;
        if (keyCount > maxKeys) return false;
        if (!checkDepth((obj as Record<string, unknown>)[k], currentDepth + 1)) {
          return false;
        }
      }
    }
    return true;
  }

  if (!checkDepth(parsed, 1)) {
    return { ok: false, error: "JSON structure exceeds safe nesting depth or key limit." };
  }

  return { ok: true, data: parsed as T };
}
