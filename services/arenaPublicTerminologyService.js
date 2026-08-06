function arenaPublicText(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/Sub\s+Division/g, "Unranked")
    .replace(/Main\s+Division/g, "Ranked");
}

module.exports = {
  arenaPublicText,
};
