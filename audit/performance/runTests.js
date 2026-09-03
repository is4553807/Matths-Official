const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { MongoClient } = require("mongodb");
const { MongoMemoryReplSet } = require("mongodb-memory-server-core");
const root = path.resolve(process.argv.find((arg) => arg.startsWith("--root="))?.slice(7) || path.join(__dirname, "../.."));
const filter = process.argv.find((arg) => arg.startsWith("--filter="))?.slice(9) || "";
const failuresFile = process.argv.find((arg) => arg.startsWith("--only-failures="))?.slice(16);
const selectedNames = failuresFile ? new Set(JSON.parse(fs.readFileSync(failuresFile)).filter((item) => ["failed", "timeout"].includes(item.status)).map((item) => item.name)) : null;
const label = process.argv.find((arg) => arg.startsWith("--label="))?.slice(8) || "tests-after";
const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"))).scripts;
const exclusions = {
  "email:verify": "Live SMTP connection check; no external credentials used",
  "smtp:verify-live-delivery": "Sends real email; intentionally not run",
  "file-storage:verify-cloud": "Uploads/deletes Cloudinary objects; intentionally not run",
  "storage-r2:verify": "Live R2 access; intentionally not run",
  "storage-lifecycle:verify-db": "Requires live R2 upload/delete; initial offline run stopped at missing local admin prerequisite",
  "production:verify": "Targets deployed HTTP server; offline audit only",
  "launch:verify": "Composite; constituent scripts run separately without stopping at first failure",
};
const outputDirectory = path.resolve(__dirname, "../../outputs/performance", label);
fs.mkdirSync(outputDirectory, { recursive: true });
const manifest = [];
function save() { fs.writeFileSync(path.join(outputDirectory, "results.json"), JSON.stringify(manifest, null, 2)); }
async function main() {
  const memory = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  const uri = memory.getUri("matths_audit_zero_assumption_20260815");
  const client = new MongoClient(uri);
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "matths-performance-tests-"));
  try {
    await client.connect();
    const seen = new Set();
    for (const [name, command] of Object.entries(scripts)) {
      if (!/verify|validate/.test(name) || (filter && !name.includes(filter)) || (selectedNames && !selectedNames.has(name))) continue;
      if (exclusions[name] || seen.has(command)) {
        manifest.push({ name, command, status: "skipped", reason: exclusions[name] || "Duplicate command alias" });
        save();
        continue;
      }
      seen.add(command);
      const commandArgs = command.split(/\s+/);
      if (commandArgs.shift() !== "node") throw new Error(`Review non-node test before running: ${command}`);
      if (process.argv.includes("--prepare")) {
        const fixtureTarget = commandArgs.at(-1);
        if (["audit/verifyPricingEntitlementDb.js", "scripts/verifyProblemTypeCatalogDb.js", "scripts/verifyStudyHallDb.js", "scripts/verifyPrivateMockRestriction.js"].includes(fixtureTarget)) {
          commandArgs.splice(0, commandArgs.length, path.join(__dirname, "runWithFixtures.js"), fixtureTarget);
        }
      }
      const started = Date.now();
      const logPath = path.join(outputDirectory, `${name.replace(/[^a-z0-9-]/gi, "_")}.log`);
      const log = fs.openSync(logPath, "w");
      const result = await new Promise((resolve) => {
        const child = spawn(process.execPath, commandArgs, {
          cwd: root, detached: true, stdio: ["ignore", log, log],
          env: { ...process.env, PERFORMANCE_TEST_DB: uri, DB: uri,
            NODE_OPTIONS: `--require=${JSON.stringify(path.join(__dirname, "testIsolation.js"))}`,
            TEST_ACCOUNT_OUTPUT_PATH: path.join(tempDirectory, "accounts.json"),
            MONGOMS_VERSION: "8.2.6",
          },
        });
        const timer = setTimeout(() => {
          try { process.kill(-child.pid, "SIGTERM"); } catch (_error) {}
        }, 180000);
        child.on("error", (error) => { clearTimeout(timer); resolve({ status: "failed", error: error.message }); });
        child.on("exit", (code, signal) => { clearTimeout(timer); resolve({ status: code === 0 ? "passed" : signal ? "timeout" : "failed", code, signal }); });
      });
      fs.closeSync(log);
      manifest.push({ name, command, ...result, ms: Date.now() - started, logPath });
      console.log(`${manifest.length}. ${result.status}: ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
      save();
      // This client was created from a fresh in-memory server, never an environment DB.
      await client.db("matths_audit_zero_assumption_20260815").dropDatabase();
    }
  } finally {
    await client.close();
    await memory.stop();
  }
  console.log(JSON.stringify(manifest.reduce((sum, item) => { sum[item.status] = (sum[item.status] || 0) + 1; return sum; }, {})));
  console.log(path.join(outputDirectory, "results.json"));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
