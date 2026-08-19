const PAYBACK_CYCLE_DAYS = 29;
const PAYBACK_ATTACK_PARTICIPATION_DAYS = 15;

function minimumAttackParticipationDays(paybackPolicy = {}) {
  const configured = Number(
    paybackPolicy?.minimumAttackParticipationDays
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : PAYBACK_ATTACK_PARTICIPATION_DAYS;
}

function attackParticipationDays(cycle = {}) {
  const current = Number(cycle?.attackParticipationDays);
  const legacy = Number(cycle?.streakDays);
  return Math.max(
    0,
    Number.isFinite(current) ? current : 0,
    Number.isFinite(legacy) ? legacy : 0
  );
}

function lastAttackParticipationDate(cycle = {}) {
  return (
    cycle?.lastAttackParticipationDateKst ||
    cycle?.lastStreakDateKst ||
    null
  );
}

module.exports = {
  PAYBACK_ATTACK_PARTICIPATION_DAYS,
  PAYBACK_CYCLE_DAYS,
  attackParticipationDays,
  lastAttackParticipationDate,
  minimumAttackParticipationDays,
};
