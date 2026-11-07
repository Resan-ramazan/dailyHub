import fs from "node:fs/promises";
import path from "node:path";
import { safeJobsPath } from "@/lib/jobs";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
};

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params;
  let file: string;
  try { file = safeJobsPath(...segs.map(decodeURIComponent)); } catch { return new Response("Forbidden", { status: 403 }); }
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return new Response("Unsupported file type", { status: 415 });
  try {
    const body = await fs.readFile(file);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
