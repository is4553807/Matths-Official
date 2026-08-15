require("dotenv").config({ path: "config.env" });

const mongoose = require("mongoose");
const matthsModels = require("../models/matthsModel");
const arenaModels = require("../models/goatArenaModel");
const paybackDailyLearningModels = require("../models/paybackDailyLearningModel");

function keySignature(key = {}, index = null) {
  if (index?.weights && Object.keys(index.weights).length) {
    return JSON.stringify(
      Object.keys(index.weights).sort().map((field) => [field, "text"])
    );
  }
  if (Object.values(key).some((direction) => direction === "text")) {
    return JSON.stringify(
      Object.keys(key).sort().map((field) => [field, key[field]])
    );
  }
  return JSON.stringify(Object.entries(key));
}

function registeredModels() {
  const byCollection = new Map();
  for (const model of Object.values({
    ...matthsModels,
    ...arenaModels,
    ...paybackDailyLearningModels,
  })) {
    if (!model?.modelName || !model?.schema || !model?.collection?.name) continue;
    byCollection.set(model.collection.name, model);
  }
  return [...byCollection.values()].sort((left, right) =>
    left.collection.name.localeCompare(right.collection.name)
  );
}

async function audit() {
  if (!process.env.DB) {
    throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  }
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  try {
    const existingCollections = new Set(
      (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray())
        .map(({ name }) => name)
    );
    const discrepancies = [];
    for (const model of registeredModels()) {
      const collection = model.collection.name;
      if (!existingCollections.has(collection)) continue;
      const expected = new Map(
        model.schema.indexes().map(([key, options]) => [
          keySignature(key),
          { key, options },
        ])
      );
      const actualIndexes = await mongoose.connection.db
        .collection(collection)
        .listIndexes()
        .toArray();
      const actual = new Map(
        actualIndexes
          .filter((index) => index.name !== "_id_")
          .map((index) => [keySignature(index.key, index), index])
      );
      const missing = [...expected.entries()]
        .filter(([signature]) => !actual.has(signature))
        .map(([, value]) => value.key);
      const extra = [...actual.entries()]
        .filter(([signature]) => !expected.has(signature))
        .map(([, value]) => ({ name: value.name, key: value.key }));
      if (missing.length || extra.length) {
        discrepancies.push({ collection, missing, extra });
      }
    }
    console.log(JSON.stringify({
      ok: discrepancies.length === 0,
      auditedCollections: registeredModels().filter((model) =>
        existingCollections.has(model.collection.name)
      ).length,
      discrepancies,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

audit().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
