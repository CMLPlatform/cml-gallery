import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/scripts/rum.js", import.meta.url), "utf8");

function browser({ endpoint = "https://rum.example.org/", fail = false } = {}) {
  const requests = [];
  const events = {};
  const observers = {};
  const document = {
    currentScript: { dataset: { endpoint } },
    visibilityState: "visible",
    addEventListener: (name, handler) => {
      events[name] = handler;
    },
  };
  const window = {
    location: { origin: "https://cmlplatform.github.io", pathname: "/cml-gallery/", search: "?private=value" },
    addEventListener: (name, handler) => {
      events[name] = handler;
    },
  };
  class PerformanceObserver {
    static supportedEntryTypes = ["largest-contentful-paint", "layout-shift"];
    constructor(callback) {
      this.callback = callback;
    }
    observe({ type }) {
      observers[type] = this.callback;
    }
    takeRecords() {
      return [];
    }
    disconnect() {}
  }
  window.PerformanceObserver = PerformanceObserver;
  runInNewContext(source, {
    window,
    document,
    PerformanceObserver,
    URL,
    navigator: { userAgent: "test-browser" },
    fetch: (url, options) => {
      if (fail) throw new Error("offline");
      requests.push({ url, options, payload: JSON.parse(options.body) });
      return Promise.resolve();
    },
  });
  return { requests, events, observers, document };
}

const record = (request) => request.payload.resourceLogs[0].scopeLogs[0].logRecords[0];

test("LCP sends labelled OTLP logs through the public proxy without credentials or URL queries", () => {
  const { requests, observers, events } = browser();
  observers["largest-contentful-paint"]({ getEntries: () => [{ startTime: 123.4, element: { tagName: "H1" } }] });
  events.pointerdown();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://rum.example.org/v1/logs");
  assert.deepEqual({ ...requests[0].options.headers }, { "Content-Type": "application/json" });
  const attributes = requests[0].payload.resourceLogs[0].resource.attributes;
  assert.equal(attributes.find(({ key }) => key === "project").value.stringValue, "cml-gallery");
  assert.equal(
    attributes.find(({ key }) => key === "page.url").value.stringValue,
    "https://cmlplatform.github.io/cml-gallery/",
  );
  assert.equal(record(requests[0]).body.stringValue, "WebVital: LCP");
  assert.equal(record(requests[0]).attributes.find(({ key }) => key === "duration_ms").value.doubleValue, 123);
});

test("CLS excludes input shifts and flushes once when the page is hidden", () => {
  const { requests, observers, events, document } = browser();
  observers["layout-shift"]({
    getEntries: () => [
      { value: 0.12, startTime: 100, hadRecentInput: false },
      { value: 0.8, hadRecentInput: true },
    ],
  });
  document.visibilityState = "hidden";
  events.visibilitychange({ timeStamp: 1000 });
  events.visibilitychange({ timeStamp: 1000 });
  assert.equal(requests.length, 1);
  assert.equal(record(requests[0]).body.stringValue, "WebVital: CLS");
  assert.equal(record(requests[0]).attributes.find(({ key }) => key === "cls_score").value.doubleValue, 0.12);
});

test("errors send technical metadata without messages, stacks or URL credentials", () => {
  const { requests, events } = browser();
  const privateValue = "fixture-private-token";
  events.error({
    message: privateValue,
    error: { stack: privateValue },
    filename: `https://user:${privateValue}@example.org/app.js?token=${privateValue}#${privateValue}`,
    lineno: 4,
  });
  events.unhandledrejection({ reason: new Error(privateValue) });
  events.error({ filename: `data:text/javascript,${privateValue}` });
  assert.equal(requests.length, 3);
  assert.equal(record(requests[0]).severityNumber, 17);
  assert.equal(
    record(requests[0]).attributes.find(({ key }) => key === "filename").value.stringValue,
    "https://example.org/app.js",
  );
  assert.equal(record(requests[1]).body.stringValue, "Unhandled promise rejection");
  assert.equal(JSON.stringify(requests).includes(privateValue), false);
});

test("missing endpoint and failed telemetry never break the page", () => {
  const disabled = browser({ endpoint: "" });
  disabled.events.error({ message: "test" });
  assert.equal(disabled.requests.length, 0);
  const offline = browser({ fail: true });
  assert.doesNotThrow(() => offline.events.error({ message: "test" }));
});
