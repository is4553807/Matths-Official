const mongoose = require("mongoose");
const { User } = require("../models/matthsModel");

const MAX_HEARTBEAT_DELTA_SECONDS = 90;

function formatConnectedHours(seconds) {
  const hours = Math.max(0, Number(seconds) || 0) / 3600;
  if (hours < 0.1) return "0시간";
  return `${hours.toFixed(hours >= 100 ? 0 : 1)}시간`;
}

async function recordConnectionHeartbeat({ userId, now = new Date() }) {
  if (!mongoose.isValidObjectId(userId)) {
    return { recordedSeconds: 0, totalConnectedSeconds: 0 };
  }
  const current = await User.findById(userId)
    .select("totalConnectedSeconds lastConnectedAt accountStatus")
    .lean();
  if (!current || current.accountStatus !== "active") {
    return { recordedSeconds: 0, totalConnectedSeconds: 0 };
  }
  const currentTime = new Date(now);
  const previousTime = current.lastConnectedAt
    ? new Date(current.lastConnectedAt)
    : null;
  const elapsedSeconds = previousTime
    ? Math.floor((currentTime.getTime() - previousTime.getTime()) / 1000)
    : 0;
  const recordedSeconds =
    elapsedSeconds > 0 && elapsedSeconds <= MAX_HEARTBEAT_DELTA_SECONDS
      ? elapsedSeconds
      : 0;
  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      lastConnectedAt: current.lastConnectedAt || null,
    },
    {
      $set: { lastConnectedAt: currentTime },
      ...(recordedSeconds
        ? { $inc: { totalConnectedSeconds: recordedSeconds } }
        : {}),
    },
    { returnDocument: "after" }
  )
    .select("totalConnectedSeconds")
    .lean();
  return {
    recordedSeconds: updated ? recordedSeconds : 0,
    totalConnectedSeconds: Number(
      updated?.totalConnectedSeconds ?? current.totalConnectedSeconds ?? 0
    ),
  };
}

module.exports = {
  MAX_HEARTBEAT_DELTA_SECONDS,
  formatConnectedHours,
  recordConnectionHeartbeat,
};
