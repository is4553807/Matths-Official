const functionLimit = require("./calculus1/functionLimit");
const limitPropertiesAndCalculation = require(
  "./calculus1/limitPropertiesAndCalculation"
);
const functionContinuity = require(
  "./calculus1/functionContinuity"
);
const continuousFunctionProperties = require(
  "./calculus1/continuousFunctionProperties"
);
const powersAndRoots = require(
  "./algebra/powersAndRoots"
);
const rationalAndRealExponents = require(
  "./algebra/rationalAndRealExponents"
);
const exponentLaws = require(
  "./algebra/exponentLaws"
);
const logarithmDefinitionAndProperties = require(
  "./algebra/logarithmDefinitionAndProperties"
);
const commonLogarithmApplications = require(
  "./algebra/commonLogarithmApplications"
);
const exponentialAndLogarithmicFunctions = require(
  "./algebra/exponentialAndLogarithmicFunctions"
);
const exponentialAndLogarithmicGraphs = require(
  "./algebra/exponentialAndLogarithmicGraphs"
);
const exponentialAndLogarithmicApplications = require(
  "./algebra/exponentialAndLogarithmicApplications"
);
const generalAnglesAndRadians = require(
  "./algebra/generalAnglesAndRadians"
);
const trigonometricFunctionsAndGraphs = require(
  "./algebra/trigonometricFunctionsAndGraphs"
);
const sineAndCosineLaws = require(
  "./algebra/sineAndCosineLaws"
);
const sequenceBasics = require(
  "./algebra/sequenceBasics"
);
const arithmeticSequences = require(
  "./algebra/arithmeticSequences"
);
const geometricSequences = require(
  "./algebra/geometricSequences"
);
const sigmaDefinitionAndProperties = require(
  "./algebra/sigmaDefinitionAndProperties"
);
const sumsOfVariousSequences = require(
  "./algebra/sumsOfVariousSequences"
);
const recursiveSequences = require(
  "./algebra/recursiveSequences"
);
const mathematicalInduction = require(
  "./algebra/mathematicalInduction"
);

const generatorRegistry = new Map([
  [
    [
      "calculus-1",
      "limits-and-continuity",
      "calculus-1-01-01",
    ].join("/"),
    functionLimit,
  ],
  [
    [
      "calculus-1",
      "limits-and-continuity",
      "calculus-1-01-02",
    ].join("/"),
    limitPropertiesAndCalculation,
  ],
  [
    [
      "calculus-1",
      "limits-and-continuity",
      "calculus-1-01-03",
    ].join("/"),
    functionContinuity,
  ],
  [
    [
      "calculus-1",
      "limits-and-continuity",
      "calculus-1-01-04",
    ].join("/"),
    continuousFunctionProperties,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-01",
    ].join("/"),
    powersAndRoots,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-02",
    ].join("/"),
    rationalAndRealExponents,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-03",
    ].join("/"),
    exponentLaws,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-04",
    ].join("/"),
    logarithmDefinitionAndProperties,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-05",
    ].join("/"),
    commonLogarithmApplications,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-06",
    ].join("/"),
    exponentialAndLogarithmicFunctions,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-07",
    ].join("/"),
    exponentialAndLogarithmicGraphs,
  ],
  [
    [
      "algebra",
      "exponential-logarithmic-functions",
      "algebra-01-08",
    ].join("/"),
    exponentialAndLogarithmicApplications,
  ],
  [
    [
      "algebra",
      "trigonometric-functions",
      "algebra-02-01",
    ].join("/"),
    generalAnglesAndRadians,
  ],
  [
    [
      "algebra",
      "trigonometric-functions",
      "algebra-02-02",
    ].join("/"),
    trigonometricFunctionsAndGraphs,
  ],
  [
    [
      "algebra",
      "trigonometric-functions",
      "algebra-02-03",
    ].join("/"),
    sineAndCosineLaws,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-01",
    ].join("/"),
    sequenceBasics,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-02",
    ].join("/"),
    arithmeticSequences,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-03",
    ].join("/"),
    geometricSequences,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-04",
    ].join("/"),
    sigmaDefinitionAndProperties,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-05",
    ].join("/"),
    sumsOfVariousSequences,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-06",
    ].join("/"),
    recursiveSequences,
  ],
  [
    [
      "algebra",
      "sequences",
      "algebra-03-07",
    ].join("/"),
    mathematicalInduction,
  ],
]);

function getProblemGenerator({
  courseId,
  unitId,
  conceptId,
}) {
  return generatorRegistry.get(
    [courseId, unitId, conceptId].join("/")
  ) || null;
}

module.exports = {
  getProblemGenerator,
};
