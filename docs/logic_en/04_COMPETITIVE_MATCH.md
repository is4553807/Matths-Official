# GOAT Arena Competitive Match

## Eligibility and placement

- Three valid normal matches unlock placement.
- A player finalizes after one to five valid placement attempts.
- A server error does not consume an attempt.
- User abandonment does not automatically restore an attempt.
- Exhausting five attempts without a valid result requires an authorized operator reset.

## Internal MMR and initial public points

The default internal MMR is 1500. Initial RD is `350 / sqrt(valid placement samples)`. Volatility for one through five samples is 0.10, 0.09, 0.08, 0.07, and 0.06. Placement also initializes public competitive points, and the existing tier cutoffs apply to those public points. These values are configurable operating hypotheses.

## Match assignment

The service selects a valid competitive record close to the challenger's internal MMR and freezes the opponent's recorded MMR state, questions, source rates, correctness, solve time, and working. The two sides may have different but similarly difficult problem sets. Questions already shown to the challenger are excluded from the next ten started normal/competitive matches.

## Internal MMR and public-point settlement

- Finalization updates the current challenger exactly once.
- It never changes the historical owner's current MMR, public points, record, or XP.
- MMR, RD, and volatility are recalculated from each win, loss, or draw.
- Glicko-2 RD provides continuous stabilization; there is no artificial fifth-to-sixth-match step.
- The result and both sides' internal expected win probability determine the public competitive-point change.
- A configured reversal multiplier dampens streak-reversal outcomes.

All overall, school, university, retaker, and worker rankings use public competitive points only.

## Runtime control

`ARENA_COMPETITIVE_ENABLED` controls competitive matchmaking. Activation requires rating simulation, staging indexes, concurrent-settlement tests, real-storage verification, and browser/mobile QA.
