const functionLimit = require(
  "./functionLimit"
);
const limitPropertiesAndCalculation = require(
  "./limitPropertiesAndCalculation"
);
const functionContinuity = require(
  "./functionContinuity"
);
const continuousFunctionProperties = require(
  "./continuousFunctionProperties"
);
const differentiationLessons = require(
  "./differentiation"
);
const integrationLessons = require(
  "./integration"
);

module.exports = [
  functionLimit,
  limitPropertiesAndCalculation,
  functionContinuity,
  continuousFunctionProperties,
  ...differentiationLessons,
  ...integrationLessons,
];
