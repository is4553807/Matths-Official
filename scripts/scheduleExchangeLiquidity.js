const { parseArgs } = require("node:util");
const mongoose = require("mongoose");

mongoose.set({ autoCreate: false, autoIndex: false });
const { integer, seoulDate } = require("../services/exchangeMarketService");
const { scheduleMarketLiquidity } = require("../services/exchangeTradingService");

async function main() {
  const { values } = parseArgs({ options: {
    market: { type: "string" },
    admin: { type: "string" },
    starts: { type: "string" },
    ends: { type: "string" },
    reference: { type: "string" },
    apply: { type: "boolean", default: false },
  } });
  if (!mongoose.isObjectIdOrHexString(values.market)) throw new Error("Specify --market as a MongoDB ObjectId.");
  if (values.apply && !mongoose.isObjectIdOrHexString(values.admin)) {
    throw new Error("Specify the administrator MongoDB ObjectId with --admin when applying the schedule.");
  }
  const startsAt = seoulDate(values.starts);
  const endsAt = seoulDate(values.ends);
  const referencePrice = integer(values.reference, 1, 999, "운영자 기준가");
  if (startsAt >= endsAt || endsAt <= new Date()) throw new Error("Specify a future end time after the start time.");
  if (!values.apply) {
    console.log(JSON.stringify({ marketId: values.market, startsAt, endsAt, referencePrice, saved: false }));
    return;
  }
  if (!process.env.DB) throw new Error("Provide DB through the deployment environment.");
  await mongoose.connect(process.env.DB);
  try {
    await scheduleMarketLiquidity(values.market, {
      startsAt: values.starts,
      endsAt: values.ends,
      referencePrice,
      reason: "유동성이 낮은 시간대에 운영자 호가 공급",
    }, values.admin);
    console.log(JSON.stringify({ marketId: values.market, startsAt, endsAt, referencePrice, saved: true }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.status ? error.message : `Liquidity scheduling failed (${error.name}).`);
  process.exitCode = 1;
});
