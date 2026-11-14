(() => {
  // biome-ignore lint/performance/useTopLevelRegex: normalise once during script initialisation.
  const ENDPOINT = (document.currentScript.dataset.endpoint || "").replace(/\/+$/, "");
  const PROJECT = "cml-gallery";
  const SERVICE = PROJECT;
  const ENV = "prod";

  let isSending = false;

  function sendLog(body, severityText, attributes) {
    if (!ENDPOINT || isSending) return;
    isSending = true;

    try {
      const timeUnixNano = `${String(Date.now())}000000`;
      const attrs = attributes || {};
      const logRecord = {
        timeUnixNano: timeUnixNano,
        observedTimeUnixNano: timeUnixNano,
        severityNumber: severityText === "ERROR" ? 17 : 9,
        severityText: severityText,
        body: { stringValue: body },
        attributes: Object.keys(attrs).map((key) => {
          const val = attrs[key];
          return {
            key: key,
            value: typeof val === "number" ? { doubleValue: val } : { stringValue: String(val) },
          };
        }),
      };

      const pagePath = window.location.origin + window.location.pathname;
      const payload = {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: SERVICE } },
                { key: "project", value: { stringValue: PROJECT } },
                { key: "env", value: { stringValue: ENV } },
                { key: "telemetry.sdk.name", value: { stringValue: "cml-rum" } },
                { key: "telemetry.sdk.language", value: { stringValue: "web-js" } },
                { key: "user_agent", value: { stringValue: navigator.userAgent } },
                { key: "page.url", value: { stringValue: pagePath } },
              ],
            },
            scopeLogs: [
              {
                scope: { name: "cml-rum", version: "1.0.0" },
                logRecords: [logRecord],
              },
            ],
          },
        ],
      };

      const headers = { "Content-Type": "application/json" };

      fetch(`${ENDPOINT}/v1/logs`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        keepalive: true,
        mode: "cors",
      }).catch(() => {
        // A failed export must not create another unhandled rejection.
      });
    } catch (_e) {
      // Never let telemetry errors escape to window.onerror
    } finally {
      isSending = false;
    }
  }

  // --- Core Web Vitals ---
  if ("PerformanceObserver" in window) {
    // LCP
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          sendLog("WebVital: LCP", "INFO", {
            vital_name: "LCP",
            duration_ms: Math.round(lastEntry.startTime),
            element: lastEntry.element ? lastEntry.element.tagName || "element" : "unknown",
          });
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Some browsers do not support this performance entry type.
    }

    // CLS
    try {
      let clsValue = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });

      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && clsValue > 0) {
          sendLog("WebVital: CLS", "INFO", {
            vital_name: "CLS",
            cls_score: Math.round(clsValue * 1000) / 1000,
          });
          clsValue = 0;
        }
      });
    } catch {
      // Some browsers do not support this performance entry type.
    }
  }

  // --- Uncaught Errors ---
  window.addEventListener("error", (evt) => {
    sendLog(evt.message || "Unhandled JavaScript Error", "ERROR", {
      error_type: "uncaught_exception",
      filename: evt.filename ? evt.filename.split("?")[0] : "unknown",
      lineno: evt.lineno || 0,
      colno: evt.colno || 0,
      stack: evt.error ? evt.error.stack || "" : "",
    });
  });

  window.addEventListener("unhandledrejection", (evt) => {
    const reason = evt.reason;
    sendLog(reason?.message ? reason.message : String(reason), "ERROR", {
      error_type: "unhandled_promise_rejection",
      stack: reason?.stack ? reason.stack : "",
    });
  });
})();
