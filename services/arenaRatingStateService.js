"use strict";

// Every producer loads this state inside its profile-writing transaction. MongoDB
// write conflicts retry the transaction, including the read and calculation.
function currentArenaRatingState(profile) {
  return {
    rating: Number(profile.rating),
    ratingDeviation: Number(profile.ratingDeviation),
    volatility: Number(profile.volatility),
    tier: String(profile.tier || "UNPLACED"),
  };
}

function applyArenaRatingState(profile, state, now) {
  profile.rating = state.rating;
  profile.ratingDeviation = state.ratingDeviation;
  profile.volatility = state.volatility;
  profile.lastRatedAt = now;
}

module.exports = { currentArenaRatingState, applyArenaRatingState };
