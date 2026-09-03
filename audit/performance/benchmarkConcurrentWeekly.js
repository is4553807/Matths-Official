/* Concurrent service benchmark on a fresh localhost database only. */
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createRequire } = require("node:module");
const assert = require("node:assert/strict");

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const at = arg.indexOf("=");
  return [arg.slice(0, at).replace(/^--/, ""), arg.slice(at + 1)];
}));
const root = path.resolve(args.root || path.join(__dirname, "../.."));
const output = path.resolve(__dirname, "../../outputs/performance", `${args.label || "weekly-concurrent"}.json`);
const concurrency = Number(args.concurrency || 8);
const rounds = Number(args.rounds || 10);
const { seed, NOW } = require("./benchmark");
const requireApp = createRequire(path.join(root, "package.json"));
const mongoose = requireApp("mongoose");
const { MongoMemoryReplSet } = requireApp("mongodb-memory-server-core");

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function main() {
  assert.ok(Number.isSafeInteger(concurrency) && concurrency > 0);
  assert.ok(Number.isSafeInteger(rounds) && rounds > 0);
  const memory = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  try {
    process.env.DB = memory.getUri("matths_performance_concurrent");
    assert.match(process.env.DB, /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(process.env.DB, { monitorCommands: true });
    const fixture = await seed();
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const run = () => requireApp("./services/weeklyMockInsightService").getAcademyWeeklyMockInsights({ academyId: fixture.academy._id, now: NOW });
    await run();

    let commandCount = 0;
    const counted = new Set(["find", "aggregate", "count", "distinct", "getMore", "insert", "update", "delete", "findAndModify"]);
    mongoose.connection.getClient().on("commandStarted", (event) => {
      if (counted.has(event.commandName)) commandCount += 1;
    });
    const samples = [];
    for (let round = 0; round < rounds; round++) {
      const beforeCommands = commandCount;
      const cpu = process.cpuUsage();
      const started = performance.now();
      const values = await Promise.all(Array.from({ length: concurrency }, run));
      const ms = performance.now() - started;
      const used = process.cpuUsage(cpu);
      assert.equal(values.length, concurrency);
      samples.push({ ms, cpuMs: (used.user + used.system) / 1000, commands: commandCount - beforeCommands });
    }
    const p50 = percentile(samples.map((sample) => sample.ms), 0.5);
    const report = {
      label: args.label || "weekly-concurrent", root, fixtureVersion: 2,
      concurrency, rounds, requests: concurrency * rounds,
      roundMs: { p50, p95: percentile(samples.map((sample) => sample.ms), 0.95) },
      nodeCpuMsPerRound: { p50: percentile(samples.map((sample) => sample.cpuMs), 0.5), p95: percentile(samples.map((sample) => sample.cpuMs), 0.95) },
      requestsPerSecondAtP50: concurrency / (p50 / 1000),
      dbCommandsPerRequest: samples.reduce((sum, sample) => sum + sample.commands, 0) / (concurrency * rounds),
      samples,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
