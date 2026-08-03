let controls = new Map();

function setActiveProblemTypeControls(nextControls) {
  controls = nextControls instanceof Map ? new Map(nextControls) : new Map();
}

function cachedProblemTypeControl(category, engineKey) {
  return controls.get(`${category}:${engineKey}`) || null;
}

function isProblemTypeEnabled(category, engineKey) {
  const control = cachedProblemTypeControl(category, engineKey);
  return !control ||
    (control.enabled !== false &&
      control.validationReport?.passed !== false &&
      control.sourceMatchesServer !== false);
}

function problemTypeSelectionWeight(category, engineKey) {
  const control = cachedProblemTypeControl(category, engineKey);
  const weight = Number(control?.selectionWeight || 1);
  return Number.isInteger(weight) && weight > 0 ? weight : 1;
}

module.exports = {
  cachedProblemTypeControl,
  isProblemTypeEnabled,
  problemTypeSelectionWeight,
  setActiveProblemTypeControls,
};
