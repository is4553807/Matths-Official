"use strict";

const { createHash } = require("node:crypto");
const QUESTION_HASH_VERSION = 2;

function canonicalValue(value) {
  if (value && typeof value.toJSON === "function") {
    const serialized = value.toJSON();
    if (serialized !== value) return canonicalValue(serialized);
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function questionPayload(question) {
  return {
    typeId: question?.typeId || "",
    typeSkeletonId: question?.typeSkeletonId || "",
    sourceTypeId: question?.sourceTypeId || "",
    prompt: question?.prompt || "",
    choices: question?.choices || [],
    visualization: question?.visualization || null,
  };
}

function questionInstanceHash(question) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(questionPayload(question))), "utf8").digest("hex");
}

// Preserve comparison with persisted v1 hashes throughout the exposure window.
function questionInstanceHashAliases(question) {
  return [...new Set([
    questionInstanceHash(question),
    createHash("sha256").update(JSON.stringify(questionPayload(question)), "utf8").digest("hex"),
  ])];
}

module.exports = { QUESTION_HASH_VERSION, canonicalValue, questionInstanceHash, questionInstanceHashAliases };
