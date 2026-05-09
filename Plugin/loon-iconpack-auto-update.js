const STORE_KEY = "codex.loon.iconpack.auto_update.meta";

function mergeMeta(base, extra) {
  const output = {};
  const sources = [base || {}, extra || {}];
  sources.forEach((source) => {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) output[key] = source[key];
    }
  });
  return output;
}

function normalizeArgs(input) {
  if (input && typeof input === "object") return input;
  if (!input || typeof input !== "string") return {};

  const args = {};
  input.split("&").forEach((part) => {
    const index = part.indexOf("=");
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return;
    args[key] = decodeURIComponent(value);
  });
  return args;
}

function truthy(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function getHeader(headers, name) {
  if (!headers) return "";
  const target = name.toLowerCase();
  for (const key in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === target) {
      return String(headers[key] || "");
    }
  }
  return "";
}

function readLast() {
  const raw = $persistentStore.read(STORE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function postUpdateNotification(subtitle, content, openUrl) {
  $notification.post("Loon icon pack update", subtitle, content, { openUrl });
}

function finish(meta, shouldNotify, subtitle, content, openUrl) {
  $persistentStore.write(JSON.stringify(meta), STORE_KEY);
  if (shouldNotify) postUpdateNotification(subtitle, content, openUrl);
  $done();
}

const args = normalizeArgs(typeof $argument === "undefined" ? "" : $argument);
const iconsetUrl = String(args.iconset || "").trim();
const action = String(args.action || "update-all").trim();
const notifyAlways = truthy(args.notifyAlways, true);
const now = new Date().toISOString();

const openUrl =
  action === "import-iconset" && iconsetUrl
    ? "loon://import?iconset=" + encodeURIComponent(iconsetUrl)
    : "loon://update?sub=all";

const baseMeta = {
  lastRun: now,
  action,
  iconsetUrl,
};

if (!iconsetUrl) {
  finish(
    mergeMeta(baseMeta, { fingerprint: "" }),
    true,
    "Scheduled reminder",
    "Tap to run Loon's update-all-subscription-resources action.",
    openUrl
  );
} else {
  $httpClient.head({ url: iconsetUrl, timeout: 10000, "auto-redirect": true }, (error, response) => {
    const last = readLast();

    if (error || !response) {
      finish(
        mergeMeta(baseMeta, { fingerprint: last.fingerprint || "", lastError: String(error || "No response") }),
        true,
        "Icon pack check failed",
        "Tap to open Loon's update action anyway.",
        openUrl
      );
      return;
    }

    const status = response.status || 0;
    const headers = response.headers || {};
    const fingerprint = [
      status,
      getHeader(headers, "etag"),
      getHeader(headers, "last-modified"),
      getHeader(headers, "content-length"),
    ].join("|");

    const changed = Boolean(last.fingerprint && last.fingerprint !== fingerprint);
    const firstRun = !last.fingerprint;
    const shouldNotify = notifyAlways || changed || status >= 400;
    const subtitle = status >= 400 ? "HTTP " + status : changed ? "Icon pack changed" : "Scheduled reminder";
    const content = firstRun
      ? "First check completed. Tap to update Loon resources."
      : changed
        ? "Remote icon pack metadata changed. Tap to update Loon resources."
        : "Tap to run Loon's update-all-subscription-resources action.";

    finish(
      mergeMeta(baseMeta, {
        status,
        fingerprint,
        etag: getHeader(headers, "etag"),
        lastModified: getHeader(headers, "last-modified"),
        contentLength: getHeader(headers, "content-length"),
      }),
      shouldNotify,
      subtitle,
      content,
      openUrl
    );
  });
}
