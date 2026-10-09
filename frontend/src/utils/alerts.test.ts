import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResourceAlerts } from "./alerts.ts";

test("cpu and memory alerts follow the 80 percent thresholds independently", () => {
  assert.deepEqual(
    buildResourceAlerts({ cpuPercent: 79, memoryPercent: 79 }, false).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    buildResourceAlerts({ cpuPercent: 80, memoryPercent: 10 }, false).map((item) => item.id),
    ["cpu"],
  );
  assert.deepEqual(
    buildResourceAlerts({ cpuPercent: 90, memoryPercent: 10 }, false).map((item) => item.id),
    ["cpu"],
  );
  assert.equal(
    buildResourceAlerts({ cpuPercent: 85.2, memoryPercent: 10 }, false)[0]?.detail,
    "CPU utilization has reached 85.2%.",
  );
  assert.deepEqual(
    buildResourceAlerts({ cpuPercent: 60, memoryPercent: 85 }, false).map((item) => item.id),
    ["memory"],
  );
  assert.equal(
    buildResourceAlerts({ cpuPercent: 10, memoryPercent: 88.4 }, false)[0]?.detail,
    "Memory utilization has reached 88.4%.",
  );
  assert.deepEqual(
    buildResourceAlerts({ cpuPercent: 91, memoryPercent: 92 }, false).map((item) => item.id),
    ["cpu", "memory"],
  );
  assert.deepEqual(buildResourceAlerts({ cpuPercent: 95, memoryPercent: 95 }, true), []);
  assert.deepEqual(buildResourceAlerts(null, false), []);
});
