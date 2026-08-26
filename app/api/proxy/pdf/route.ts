import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";

// Vercel serverless config: extend timeout for large PDF downloads
export const maxDuration = 30; // seconds (default is 10 on hobby tier)
export const dynamic = "force-dynamic";

// Only these hosts may ever be fetched by this proxy. Proposals are
// expected to link to Google Drive/Docs only (per the app's own upload
// flow), so there is no legitimate reason to fetch anything else.
const ALLOWED_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "googleusercontent.com",
]);

function isHostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return [...ALLOWED_HOSTS].some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

// Reject private, loopback, link-local, and other non-public IP ranges so
// an allowlisted-looking hostname can't be DNS-rebound to internal infra
// (e.g. cloud metadata endpoints).
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      // IPv4-mapped IPv6 — check the embedded v4 address too
      const v4 = lower.split(":").pop();
      if (v4 && net.isIPv4(v4)) return isPrivateOrReservedIp(v4);
    }
    return false;
  }
  return true; // not a recognizable IP — treat as unsafe
}

async function assertHostIsSafeToFetch(rawUrl: string): Promise<void> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (!isHostAllowed(parsed.hostname)) {
    throw new Error(`Host "${parsed.hostname}" is not on the allowlist`);
  }
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(`Host "${parsed.hostname}" resolves to a private/reserved IP`);
    }
  }
}

// Simple in-memory rate limiter: userId -> { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // max requests per minute
const RATE_WINDOW = 60_000; // 1 minute in ms

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT;
}

/**
 * Extract a Google Drive file ID from various URL formats:
 *  - https://drive.google.com/file/d/FILE_ID/view
 *  - https://drive.google.com/open?id=FILE_ID
 *  - https://docs.google.com/document/d/FILE_ID/edit
 */
function extractGoogleDriveId(url: string): string | null {
  // Pattern: /d/FILE_ID/
  const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch) return dMatch[1];

  // Pattern: ?id=FILE_ID
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("id");
    if (id) return id;
  } catch {
    // Not a valid URL
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate caller
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Rate limit
    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

    // 3. Get and validate URL
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url");

    if (!rawUrl) {
      return NextResponse.json(
        { error: "Missing 'url' query parameter" },
        { status: 400 }
      );
    }

    // 4. Build the download URL
    let downloadUrl: string;
    const driveId = extractGoogleDriveId(rawUrl);

    if (driveId) {
      // Google Drive — use direct download endpoint with confirm=t to bypass virus scan warning for large files
      downloadUrl = `https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`;
    } else {
      // Not Google Drive — attempt to fetch directly (still subject to the
      // host allowlist below, so this only succeeds for Drive/Docs URLs
      // that extractGoogleDriveId couldn't parse an ID out of).
      downloadUrl = rawUrl;
    }

    // 5. Fetch the PDF server-side, following redirects manually so every
    // hop is re-validated against the allowlist and private-IP block —
    // this prevents an allowlisted host from redirecting the proxy to an
    // internal/private target (SSRF via redirect).
    let currentUrl = downloadUrl;
    let pdfResponse: Response;
    const MAX_REDIRECTS = 5;
    try {
      let redirects = 0;
      for (;;) {
        await assertHostIsSafeToFetch(currentUrl);
        const res = await fetch(currentUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; hackX-jr-proxy/1.0)",
          },
          redirect: "manual",
        });

        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          if (++redirects > MAX_REDIRECTS) {
            throw new Error("Too many redirects");
          }
          currentUrl = new URL(res.headers.get("location")!, currentUrl).toString();
          continue;
        }

        pdfResponse = res;
        break;
      }
    } catch (err) {
      console.error(`[PDF proxy] Blocked or failed request for ${currentUrl}:`, err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: "Unable to fetch this URL. Only Google Drive/Docs links are supported." },
        { status: 400 }
      );
    }

    if (!pdfResponse.ok) {
      console.error(`[PDF proxy] Upstream error: ${pdfResponse.status} ${pdfResponse.statusText} for ${currentUrl}`);
      return NextResponse.json(
        { error: `Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}` },
        { status: 502 }
      );
    }

    const contentType = pdfResponse.headers.get("content-type") || "";

    // Google Drive returns HTML pages for login walls, virus scan confirmations, etc.
    // Valid PDF downloads come as application/pdf OR application/octet-stream.
    if (contentType.includes("text/html")) {
      console.error(`[PDF proxy] Got HTML instead of PDF for ${currentUrl}`);
      return NextResponse.json(
        { error: "Google Drive returned an HTML page instead of a PDF. Please ensure the Google Drive link is set to 'Anyone with the link can view' and is a direct file link." },
        { status: 403 }
      );
    }

    // 6. Read the full response
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // 7. Validate that the buffer actually starts with %PDF
    const header = new Uint8Array(pdfBuffer.slice(0, 5));
    const headerStr = String.fromCharCode(...header);
    if (!headerStr.startsWith("%PDF")) {
      console.error(`[PDF proxy] Response is not a PDF. First bytes: "${headerStr}" for ${currentUrl}`);
      return NextResponse.json(
        { error: "The downloaded file is not a valid PDF." },
        { status: 422 }
      );
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    console.error("PDF proxy error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
