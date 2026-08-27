const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(
  root,
  ".github/workflows/cloudtype-production-deploy.yml"
);
const runbookPath = path.join(
  root,
  ".github/runbooks/cloudtype-production-release.md"
);
const workflowSource = fs.readFileSync(workflowPath, "utf8");
const workflow = yaml.load(workflowSource);

assert.ok(workflow.on?.workflow_dispatch, "수동 workflow_dispatch가 없습니다.");
for (const forbiddenTrigger of ["push", "pull_request", "pull_request_target", "schedule"]) {
  assert.equal(workflow.on?.[forbiddenTrigger], undefined, `${forbiddenTrigger} 자동 배포가 켜졌습니다.`);
}
assert.equal(workflow.permissions?.contents, "read");
assert.equal(workflow.concurrency?.["cancel-in-progress"], false);

const job = workflow.jobs?.deploy;
assert.ok(job, "deploy job이 없습니다.");
assert.equal(job.environment, "production");
assert.ok(Number(job["timeout-minutes"]) <= 30);
assert.equal(
  job.env?.EXPECTED_PUBLIC_CONTACT_EMAIL,
  "dltkddbs4553@matths.kr"
);
for (const variable of [
  "CLOUDTYPE_API_KEY",
  "CLOUDTYPE_PROJECT",
  "CLOUDTYPE_STAGE",
  "CLOUDTYPE_APP",
  "CLOUDTYPE_SOURCE_BRANCH",
]) {
  assert.match(workflowSource, new RegExp(variable));
}

assert.match(workflowSource, /DEPLOY_PRODUCTION/);
assert.match(workflowSource, /CLOUDTYPE_SOURCE_BRANCH[^\n]*main|"\$\{CLOUDTYPE_SOURCE_BRANCH\}" != "main"/);
assert.match(workflowSource, /git rev-parse origin\/main/);
assert.match(workflowSource, /actions\/setup-node@v4/);
assert.match(workflowSource, /node-version: 24/);
assert.match(workflowSource, /npm run launch:verify/);
assert.match(workflowSource, /npm ci --no-audit/);
assert.match(workflowSource, /npm run launch-db:verify-memory/);
assert.match(workflowSource, /https:\/\/api\.cloudtype\.io\/webhooks\/deploy/);
assert.match(workflowSource, /Authorization: Bearer \$\{CLOUDTYPE_API_KEY\}/);
assert.equal(
  job.env?.CLOUDTYPE_API_KEY,
  undefined,
  "Cloudtype API key를 job 전체에 노출하면 안 됩니다."
);
assert.doesNotMatch(
  workflowSource,
  /webhooks\/deploy\?[^\n]*(?:token|apikey)/i,
  "API key를 URL query로 보내면 안 됩니다."
);
assert.match(workflowSource, /npm run production:verify/);
assert.match(workflowSource, /--wait-seconds 600/);
assert.match(workflowSource, /Cloudtype release ID and rollback release ID/);

const runbook = fs.readFileSync(runbookPath, "utf8");
for (const required of [
  "CLOUDTYPE_API_KEY",
  "CLOUDTYPE_PROJECT",
  "CLOUDTYPE_STAGE",
  "CLOUDTYPE_APP",
  "CLOUDTYPE_SOURCE_BRANCH",
  "APPLE_PRIVATE_KEY",
  "dltkddbs4553@matths.kr",
  "rollback release ID",
  "DEPLOY_PRODUCTION",
  "npm run production:verify",
]) {
  assert.ok(runbook.includes(required), `런북에 ${required}가 없습니다.`);
}
assert.doesNotMatch(runbook, /BEGIN (?:EC )?PRIVATE KEY/);

console.log(
  "Cloudtype production workflow verified: manual confirmation, main-tip gate, " +
    "secret-safe webhook, full preflight, post-deploy smoke, and rollback evidence."
);
