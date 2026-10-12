# Arena Internal MMR, Public Competitive Points, and Performance Scoring

## Internal performance

Each observation uses server-determined correctness and an exact source accuracy rate strictly between zero and one. Five observations produce actual correct count, expected correct count, variance, and a difficulty-adjusted performance score. Missing, extreme, or incomplete source data cannot create an official comparison.

Normal and competitive award the result to the higher performance score when the difference exceeds the configured close threshold. Inside the close range, shorter valid solve time wins; equal time is a draw. Group challenge ranking uses correct count then time and retains the difficulty-adjusted score as result information.

## Glicko-2 configuration

- Default rating: 1500
- Default RD: 350
- Default volatility: 0.06
- Tau: 0.5
- Normal hidden-MMR baseline: 1000

`services/goatArenaV2Config.js` validates environment overrides and rejects invalid ranges during startup.

## Adaptive movement

Fewer placement samples retain higher RD and volatility. Internal MMR, RD, and volatility converge continuously through Glicko-2 rather than switching policy at a fixed match count. Public competitive points use the result and the internal-MMR expected win probability to determine their gain or loss. A weekly mock updates only a placed participant's internal MMR; it never changes public points, and non-participation changes nothing. A streak reversal applies a multiplier based on the prior streak length. Every settled win, loss, or draw persists MMR, RD, and volatility.

## Validation

`arena-v2:simulate` and `arena-normal-baseline:simulate` measure one-sided inflation/deflation, skill-band win rates, different-set fairness, and baseline-record bias. Simulation output is activation evidence, not a permanent calibration decision.
