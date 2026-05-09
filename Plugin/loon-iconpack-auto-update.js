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

function parseIconsetUrls(value) {
  if (!value) return [];
  return String(value)
    .split(/[\n\r,;|]+/)
    .map((url) => url.trim())
    .filter(Boolean);
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

function notifyIconsets(subtitle, content, urls) {
  urls.forEach((url, index) => {
    const itemSubtitle = urls.length > 1 ? subtitle + " " + (index + 1) + "/" + urls.length : subtitle;
    $notification.post("Loon 图标包更新", itemSubtitle, content, {
      openUrl: "loon://import?iconset=" + encodeURIComponent(url),
    });
  });
}

function finish(meta, shouldNotify, subtitle, content, openUrl) {
  $persistentStore.write(JSON.stringify(meta), STORE_KEY);
  if (shouldNotify) postUpdateNotification(subtitle, content, openUrl);
  $done();
}

const args = normalizeArgs(typeof $argument === "undefined" ? "" : $argument);
const iconsetUrl = String(args.iconset || "").trim();
const iconsetUrls = parseIconsetUrls(iconsetUrl);
const action = String(args.action || "import-iconset").trim();
const notifyAlways = truthy(args.notifyAlways, true);
const now = new Date().toISOString();

const openUrl =
  action === "import-iconset" && iconsetUrls.length === 1
    ? "loon://import?iconset=" + encodeURIComponent(iconsetUrls[0])
    : "loon://update?sub=all";

const baseMeta = {
  lastRun: now,
  action,
  iconsetUrls,
};

if (!iconsetUrls.length) {
  finish(
    mergeMeta(baseMeta, { fingerprint: "" }),
    true,
    "定时提醒",
    "点击通知后，Loon 会执行更新全部订阅资源。",
    openUrl
  );
} else {
  const results = [];

  function checkNext(index) {
    if (index >= iconsetUrls.length) {
      const last = readLast();
      const fingerprint = results
        .map((item) => [item.url, item.status, item.etag, item.lastModified, item.contentLength, item.error].join("|"))
        .join("\n");
      const changed = Boolean(last.fingerprint && last.fingerprint !== fingerprint);
      const firstRun = !last.fingerprint;
      const hasError = results.some((item) => item.error || item.status >= 400);
      const shouldNotify = notifyAlways || changed || hasError;
      const subtitle = hasError ? "图标包检测异常" : changed ? "图标包有变化" : "定时提醒";
      const prefix = iconsetUrls.length > 1 ? iconsetUrls.length + " 个图标包：" : "";
      const content = firstRun
        ? prefix + "首次检测完成。点击通知后更新 Loon 资源。"
        : changed
          ? prefix + "远程图标包信息发生变化。点击通知后导入/刷新图标包。"
          : prefix + "点击通知后，Loon 会导入/刷新图标包。";

      const meta = mergeMeta(baseMeta, {
        fingerprint,
        results,
      });

      if (shouldNotify && action === "import-iconset") {
        $persistentStore.write(JSON.stringify(meta), STORE_KEY);
        notifyIconsets(subtitle, content, iconsetUrls);
        $done();
        return;
      }

      finish(
        meta,
        shouldNotify,
        subtitle,
        content,
        openUrl
      );
      return;
    }

    const url = iconsetUrls[index];
    $httpClient.head({ url, timeout: 10000, "auto-redirect": true }, (error, response) => {
      if (error || !response) {
        results.push({
          url,
          status: 0,
          etag: "",
          lastModified: "",
          contentLength: "",
          error: String(error || "No response"),
        });
        checkNext(index + 1);
        return;
      }

      const status = response.status || 0;
      const headers = response.headers || {};
      results.push({
        url,
        status,
        etag: getHeader(headers, "etag"),
        lastModified: getHeader(headers, "last-modified"),
        contentLength: getHeader(headers, "content-length"),
        error: "",
      });
      checkNext(index + 1);
    });
  }

  checkNext(0);
}
