"use strict";

const { wave1Batch3CountingDefinitions } = require("./wave1Batch3Counting");
const { wave1Batch3ProbabilityDefinitions } = require("./wave1Batch3Probability");
const { wave1Batch3SequenceDefinitions } = require("./wave1Batch3Sequences");

const wave1Batch3Definitions = [
  ...wave1Batch3SequenceDefinitions,
  ...wave1Batch3CountingDefinitions,
  ...wave1Batch3ProbabilityDefinitions,
];

if (wave1Batch3Definitions.length !== 43) {
  throw new Error(`wave1 batch 3 expected 43 definitions, got ${wave1Batch3Definitions.length}`);
}

module.exports = { wave1Batch3Definitions };
