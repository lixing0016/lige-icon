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

  const trimmed = input.trim();
  if (trimmed.charAt(0) === "[" && trimmed.charAt(trimmed.length - 1) === "]") {
    const values = trimmed.slice(1, -1).split(",");
    return {
      iconset: values[0] || "",
      action: values[1] || "",
      notifyAlways: values[2] || "",
    };
  }

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
  $notification.post("Loon 图标包更新", subtitle, content, { openUrl });
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
    "定时提醒",
    "点击通知后，Loon 会执行更新全部订阅资源。",
    openUrl
  );
} else {
  $httpClient.head({ url: iconsetUrl, timeout: 10000, "auto-redirect": true }, (error, response) => {
    const last = readLast();

    if (error || !response) {
      finish(
        mergeMeta(baseMeta, { fingerprint: last.fingerprint || "", lastError: String(error || "No response") }),
        true,
        "图标包检测失败",
        "点击通知后，仍可打开 Loon 的资源更新动作。",
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
    const subtitle = status >= 400 ? "HTTP " + status : changed ? "图标包有变化" : "定时提醒";
    const content = firstRun
      ? "首次检测完成。点击通知后更新 Loon 资源。"
      : changed
        ? "远程图标包信息发生变化。点击通知后更新 Loon 资源。"
        : "点击通知后，Loon 会执行更新全部订阅资源。";

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
