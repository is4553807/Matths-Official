"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");
const { ArenaNormalBaselineQuestion } = require("../models/goatArenaModel");
const { batchAssets, documentForQuestion } = require("../scripts/arenaFontBaselineArtifacts");

async function main() {
  assert.match(String(process.env.DB || ""), /matths_audit_zero_assumption_20260815/);
  await mongoose.connect(process.env.DB);
  let application = null;
  const originalWarning = console.warn;
  const warnings = [];
  const leaseService = require("../services/schedulerLeaseService");
  const originalLease = leaseService.withSchedulerLease;
  const startupJobs = new Set();
  leaseService.withSchedulerLease = (...args) => {
    const job = originalLease(...args);
    startupJobs.add(job);
    job.then(() => startupJobs.delete(job), () => startupJobs.delete(job));
    return job;
  };
  try {
    const directory = path.resolve("output/baseline/normal60_20261012");
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json")));
    const byName = new Map(batchAssets(directory, manifest).map(asset => [asset.originalName, asset]));
    await ArenaNormalBaselineQuestion.insertMany(manifest.questions.map(question => documentForQuestion(question, byName, byName.get("manifest.json"))));
    await User.collection.insertMany([1, 2].map(index => ({
      email: `startup-admin-${index}@example.invalid`, role: "admin", accountStatus: "active", isActive: true,
    })));
    process.env.ARENA_NORMAL_BASELINE_AUTO_ACTIVATE = "true";
    process.env.ARENA_NORMAL_BASELINE_OPERATOR_EMAIL = "shared-admin-mailbox@example.invalid";

    const portProbe = net.createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    process.env.PORT = String(portProbe.address().port);
    await new Promise(resolve => portProbe.close(resolve));
    process.env.APP_BASE_URL = `http://127.0.0.1:${process.env.PORT}`;
    process.env.PUBLIC_BASE_URL = process.env.APP_BASE_URL;
    console.warn = (...args) => { warnings.push(args.join(" ")); originalWarning(...args); };
    application = require("../server");
    const httpServer = await application.startApplication();
    if (!httpServer.listening) await once(httpServer, "listening");
    for (const endpoint of ["health", "ready"]) {
      const response = await fetch(`${process.env.APP_BASE_URL}/api/v1/${endpoint}`, { signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 200, `${endpoint} must remain available after activation is deferred`);
      assert.equal((await response.json()).status, "ready");
    }
    assert.ok(warnings.some(message => message.includes("ARENA_NORMAL_BASELINE_OPERATOR_INVALID") && message.includes("Web startup will continue")));
    assert.equal(await ArenaNormalBaselineQuestion.countDocuments({ batchKey: manifest.batchKey, status: "REVIEW_PENDING" }), 540);
    assert.equal(await ArenaNormalBaselineQuestion.countDocuments({ batchKey: manifest.batchKey, status: "ACTIVE" }), 0);
    console.log("Normal beta startup regression verified: group mailbox with two existing administrators cannot approve the batch; the actual server starts and both health/readiness return HTTP 200 while all 540 questions remain pending.");
  } finally {
    await Promise.allSettled([...startupJobs]);
    leaseService.withSchedulerLease = originalLease;
    console.warn = originalWarning;
    if (application) await application.shutdown("normal-baseline-startup-audit");
    else await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
