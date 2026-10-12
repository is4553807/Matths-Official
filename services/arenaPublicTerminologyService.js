function arenaPublicText(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/Sub\s+Division/g, "일반전")
    .replace(/Main\s+Division/g, "경쟁전")
    .replace(/\bUnranked\b/g, "일반전")
    .replace(/\bRanked\b/g, "경쟁전");
}

module.exports = {
  arenaPublicText,
};
