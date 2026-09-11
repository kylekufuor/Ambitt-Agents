import assert from "node:assert/strict";
import { describeAgentStatus, describeSchedule, formatNextRun } from "./agent-presentation";

for (const [cron, expected] of [
  ["0 8 * * 1", "Mondays at 8:00 am"],
  ["30 13 * * 1-5", "Weekdays at 1:30 pm"],
  ["0 0 * * *", "Every day at 12:00 am"],
  ["0 12 * * 0,7", "Sundays at 12:00 pm"],
  ["0 8 1 * *", "0 8 1 * *"],
  ["0 8 * 12 *", "0 8 * 12 *"],
  ["61 25 * * 1", "61 25 * * 1"],
  ["0 8 * * 1,9", "0 8 * * 1,9"],
  ["0 0 8 * * 1", "0 0 8 * * 1"],
]) assert.equal(describeSchedule(cron), expected);
assert.match(formatNextRun("2026-09-14T13:00:00Z", "America/Chicago"), /8:00 AM CDT/);
assert.match(formatNextRun("2026-12-14T14:00:00Z", "America/Chicago"), /8:00 AM CST/);
assert.match(formatNextRun("2026-09-14T13:00:00Z", "invalid"), /1:00 PM UTC/);
assert.equal(formatNextRun("invalid", "UTC"), "not yet scheduled");
const active = describeAgentStatus({status:"active", pausedBy:null, nextScheduledRun:null, timezone:"UTC"});
assert.equal(active.label, "Active");
assert.doesNotMatch(active.line, /his|working/i);
console.log("agent presentation: 15 checks passed");
