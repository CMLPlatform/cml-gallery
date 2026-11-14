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
    let lcpObserver;
    let latestLcp;
    let lcpFinalized = document.visibilityState === "hidden";
    let firstHiddenTime = lcpFinalized ? 0 : Infinity;
    let clsObserver;
    let sessionStart = 0;
    let lastShiftTime = 0;
    let sessionScore = 0;
    let clsScore = 0;
    let reportedCls = 0;

    function updateLcp(entries) {
      if (lcpFinalized) return;
      for (const entry of entries) {
        if (entry.startTime < firstHiddenTime) latestLcp = entry;
      }
    }

    function finalizeLcp() {
      if (lcpFinalized) return;
      if (lcpObserver) {
        updateLcp(lcpObserver.takeRecords());
        lcpObserver.disconnect();
      }
      lcpFinalized = true;
      if (latestLcp) {
        sendLog("WebVital: LCP", "INFO", {
          vital_name: "LCP",
          duration_ms: Math.round(latestLcp.startTime),
          element: latestLcp.element ? latestLcp.element.tagName || "element" : "unknown",
        });
      }
    }

    function updateCls(entries) {
      for (const entry of entries) {
        if (entry.hadRecentInput) continue;
        // A session ends at a one-second gap or a five-second total span.
        if (
          sessionScore > 0 &&
          entry.startTime - lastShiftTime < 1000 &&
          entry.startTime - sessionStart < 5000
        ) {
          sessionScore += entry.value;
        } else {
          sessionStart = entry.startTime;
          sessionScore = entry.value;
        }
        lastShiftTime = entry.startTime;
        clsScore = Math.max(clsScore, sessionScore);
      }
    }

    try {
      if (!lcpFinalized) {
        lcpObserver = new PerformanceObserver((list) => updateLcp(list.getEntries()));
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
      }
    } catch {
      // Some browsers do not support this performance entry type.
    }
    try {
      clsObserver = new PerformanceObserver((list) => updateCls(list.getEntries()));
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      // Some browsers do not support this performance entry type.
    }

    for (const event of ["pointerdown", "touchstart", "keydown", "scroll"]) {
      window.addEventListener(event, finalizeLcp, { once: true, capture: true, passive: true });
    }
    document.addEventListener("visibilitychange", (event) => {
      if (document.visibilityState !== "hidden") return;
      firstHiddenTime = Math.min(firstHiddenTime, event.timeStamp);
      finalizeLcp();
      if (clsObserver) updateCls(clsObserver.takeRecords());
      if (clsScore > reportedCls) {
        sendLog("WebVital: CLS", "INFO", {
          vital_name: "CLS",
          cls_score: Math.round(clsScore * 1000) / 1000,
        });
        reportedCls = clsScore;
      }
    });
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
