const assert = require("node:assert/strict");

const {
  buildProblemEngineRegistry,
  validateRegistryEngine,
} = require("../services/problemTypeCatalogService");

async function main() {
  const registry = buildProblemEngineRegistry();
  const counts = new Map();
  const failures = [];

  assert.ok(registry.size > 0, "문제 유형 레지스트리가 비어 있습니다.");

  for (const engine of registry.values()) {
    counts.set(engine.category, (counts.get(engine.category) || 0) + 1);
    assert.match(engine.sourceHash, /^[a-f0-9]{64}$/);
    assert.ok(engine.sourceSnapshot, `${engine.engineKey}: 소스 스냅샷이 없습니다.`);
    assert.ok(engine.sourceSnapshot.length <= 23900, `${engine.engineKey}: 소스 스냅샷이 너무 큽니다.`);

    const report = await validateRegistryEngine(engine, { sampleCount: 1 });
    if (!report.passed) {
      failures.push({
        category: engine.category,
        engineKey: engine.engineKey,
        failures: report.failures,
      });
    }
  }

  for (const category of [
    "CONCEPT_PRACTICE",
    "ASSESSMENT_CENTER",
    "PLACEMENT_EXAM",
  ]) {
    assert.ok((counts.get(category) || 0) > 0, `${category} 유형이 없습니다.`);
  }
  assert.deepEqual(failures, [], `검산 실패 문제 유형: ${JSON.stringify(failures.slice(0, 10))}`);

  console.log(
    `Problem type catalog verification passed: ${registry.size} types ` +
      [...counts.entries()].map(([key, value]) => `${key}=${value}`).join(", ")
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
