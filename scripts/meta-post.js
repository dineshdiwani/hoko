#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const {
  postMetaCampaign,
  resolveMetaPageId,
  resolveMetaAccessToken
} = require("../server/utils/metaPublisher");

dotenv.config();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const message = String(args.message || process.env.META_POST_MESSAGE || "").trim();
  const link = String(args.link || process.env.META_POST_LINK || "").trim();
  const mediaUrl = String(args["media-url"] || process.env.META_POST_MEDIA_URL || "").trim();
  const pageId = String(args["page-id"] || process.env.META_PAGE_ID || "").trim();
  const mediaPath = String(args["media-file"] || process.env.META_POST_MEDIA_FILE || "").trim();
  const mode = String(args.mode || "").trim().toLowerCase();
  const accessToken = resolveMetaAccessToken();

  let mediaFile = null;
  if (mediaPath) {
    const absolutePath = path.isAbsolute(mediaPath) ? mediaPath : path.join(process.cwd(), mediaPath);
    const buffer = fs.readFileSync(absolutePath);
    mediaFile = {
      buffer,
      originalname: path.basename(absolutePath),
      mimetype: guessMimeType(absolutePath)
    };
  }

  if (!message && !link && !mediaUrl && !mediaFile) {
    throw new Error("Provide --message, --link, --media-url, or --media-file");
  }
  if (mode === "url" && !mediaUrl) {
    throw new Error("Provide --media-url when using --mode url");
  }
  if (mode === "file" && !mediaFile) {
    throw new Error("Provide --media-file when using --mode file");
  }

  const result = await postMetaCampaign({
    pageId: pageId || resolveMetaPageId(),
    accessToken,
    message,
    link,
    mediaUrl: mode === "text" ? "" : mediaUrl,
    mediaFile: mode === "file" ? mediaFile : null
  });

  process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.message || err}\n`);
  process.exitCode = 1;
});
