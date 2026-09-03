// Evaluate an optional non-unique index only on a newly-created local replica set.
const { performance } = require("node:perf_hooks");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { seed } = require("./benchmark");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");
const { ProblemAttempt } = require("../../models/matthsModel");
const { getClassMathMap } = require("../../services/mathMapService");
const candidateName = "performance_candidate_math_map_order";
async function main() {
  const memory = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  try {
    const uri = memory.getUri("performance_index_experiment");
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
    await mongoose.connect(uri);
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    const fixture = await seed();
    const studentUserIds = fixture.students.map((student) => student._id);
    const results = [];
    let pipeline;
    const aggregate = ProblemAttempt.aggregate;
    ProblemAttempt.aggregate = function (stages, ...rest) {
      if (stages.some((stage) => stage.$group?.attempts)) pipeline = stages;
      return aggregate.call(this, stages, ...rest);
    };
    async function measure(label) {
      const samples = [];
      for (let index = 0; index < 26; index++) {
        const started = performance.now();
        const cpu = process.cpuUsage();
        await getClassMathMap({ studentUserIds });
        const used = process.cpuUsage(cpu);
        if (index) samples.push({ ms: performance.now() - started, cpuMs: (used.user + used.system) / 1000 });
      }
      const percentile = (key, fraction) => samples.map((sample) => sample[key]).sort((a, b) => a - b)[Math.ceil(samples.length * fraction) - 1];
      const explain = await aggregate.call(ProblemAttempt, pipeline).explain("executionStats");
      const cursor = explain.stages?.find((stage) => stage.$cursor)?.$cursor || explain;
      const stages = new Set();
      const indexes = new Set();
      function inspectPlan(value) {
        if (!value || typeof value !== "object") return;
        if (value.stage) stages.add(value.stage);
        if (value.indexName) indexes.add(value.indexName);
        Object.values(value).forEach(inspectPlan);
      }
      inspectPlan(cursor.queryPlanner?.winningPlan);
      const execution = cursor.executionStats;
      const result = { label, p50: percentile("ms", 0.5), p95: percentile("ms", 0.95), cpuMs: percentile("cpuMs", 0.5),
        plan: { stages: [...stages], indexes: [...indexes], executionMs: execution?.executionTimeMillis, docsExamined: execution?.totalDocsExamined, keysExamined: execution?.totalKeysExamined } };
      results.push(result);
      const destination = path.join(__dirname, "../../outputs/performance/index-experiment.json");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, JSON.stringify(results, null, 2));
      console.log(JSON.stringify(result));
    }
    await measure("existing-indexes");
    await ProblemAttempt.collection.createIndex({ userId: 1, reviewSourceAttemptId: 1, attemptNumber: 1, submittedAt: -1, _id: -1 }, { name: candidateName });
    await measure("candidate-index");
    // Exactly this experimental index on this tool's fresh local database only.
    await ProblemAttempt.collection.dropIndex(candidateName);
    await measure("existing-indexes-recheck");
    ProblemAttempt.aggregate = aggregate;
  } finally {
    await mongoose.disconnect();
    await memory.stop();
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
