const assert = require("node:assert/strict");
const { replayBotFills } = require("../services/exchangeBotReplayService");

const minute = 60_000;
const start = Date.parse("2026-11-08T06:00:00.000Z");
const at = (minutes) => new Date(start + minutes * minute);
const attempt = (number, score, time, source = "BOT") => ({
  botId: `bot-${number}`, number, score, submittedAt: at(time), source,
});
const sample = (mpi, cutoff, publication, unavailable = false) => ({
  mpi, sampledAt: at(cutoff), dataCutoffAt: at(cutoff), publishAt: at(publication), unavailable,
});

const attempts = [attempt(5, 80, 90), attempt(2, 20, 3), attempt(4, 100, 4, "HUMAN"),
  attempt(1, 20, 2), attempt(3, 100, 22)];
const snapshots = [sample(600, 60, 90), sample(600, 5, 35), sample(600, 25, 55), sample(600, 23, 53, true)];
const options = { before: at(90), reconstructedAt: at(95) };
const fills = replayBotFills(attempts, snapshots, options);
assert.deepEqual(fills, replayBotFills([...attempts].reverse(), [...snapshots].reverse(), options));
assert.equal(fills.length, 1);
assert.deepEqual(fills.map(({ tradedAt, price, makerLabel, takerLabel }) => ({ tradedAt, price, makerLabel, takerLabel })), [
  { tradedAt: at(55), price: 463, makerLabel: "TraderBot1", takerLabel: "TraderBot3" },
]);
assert.equal(fills[0].quantity, 1);
assert.equal(fills[0].makerSource, "BOT");
assert.equal(fills[0].takerSource, "BOT");
assert.equal(fills[0].source, "BOT_REPLAY");
assert.equal(fills[0].reconstructedAt.getTime(), at(95).getTime());
assert.match(fills[0].replayId, /^[a-f\d]{64}$/);
assert.deepEqual(replayBotFills(attempts, snapshots, { ...options, before: at(55) }), []);
assert.deepEqual(replayBotFills(attempts, snapshots, { ...options, reconstructedAt: at(55) }), []);
assert.deepEqual(replayBotFills(attempts, [sample(600, 25, 20)], options), []);
console.log("BOT replay verified: historical publication cutoff, source provenance, deterministic price-time matching, and explicit reconstruction timestamp.");
