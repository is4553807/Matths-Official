const TIER_ROWS = [
  ["bronze", "BRONZE", "브론즈", "#d99662", "#422217", "v6"],
  ["silver", "SILVER", "실버", "#d7e1ec", "#283540", "v6"],
  ["gold", "GOLD", "골드", "#ffd15a", "#4d340c", "v6"],
  ["platinum", "PLATINUM", "플래티넘", "#65f6ee", "#123f43", "v7"],
  ["emerald", "EMERALD", "에메랄드", "#42e68e", "#0b3e2a", "v6"],
  ["diamond", "DIAMOND", "다이아몬드", "#77b9ff", "#17365f", "v6"],
  ["master", "MASTER", "마스터", "#c17aff", "#3d1d5e", "v6"],
  ["grandmaster", "GRANDMASTER", "그랜드마스터", "#ff547f", "#54152c", "v6"],
  ["challenger", "CHALLENGER", "챌린저", "#c9f7ff", "#164766", "v12"],
];

export const MATTHS_RANK_TIERS = Object.freeze(
  Object.fromEntries(
    TIER_ROWS.map(([slug, label, koLabel, accent, accentDeep, version], index) => [
      slug,
      Object.freeze({
        index,
        slug,
        label,
        koLabel,
        accent,
        accentDeep,
        version,
        video: `${slug}-rank-up.${version}.mp4`,
        poster: `${slug}-rank-up.${version}-poster.webp`,
      }),
    ]),
  ),
);

export const MATTHS_RANK_TIER_ORDER = Object.freeze(TIER_ROWS.map(([slug]) => slug));

const TIER_ALIASES = Object.freeze({
  grandmaster: "grandmaster",
  grandmasters: "grandmaster",
  grandmst: "grandmaster",
});

export function normalizeRankTier(value) {
  const compact = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const slug = TIER_ALIASES[compact] || compact;
  return Object.prototype.hasOwnProperty.call(MATTHS_RANK_TIERS, slug) ? slug : null;
}

export function getRankTier(value) {
  const slug = normalizeRankTier(value);
  return slug ? MATTHS_RANK_TIERS[slug] : null;
}

export function resolveRankTierMedia(value, assetBase = "/media/rank-motion") {
  const tier = getRankTier(value);
  if (!tier) return null;

  const base = String(assetBase || "/media/rank-motion").replace(/\/+$/, "");
  return Object.freeze({
    ...tier,
    src: `${base}/${tier.video}`,
    posterSrc: `${base}/${tier.poster}`,
  });
}
