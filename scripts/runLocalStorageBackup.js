const path = require("node:path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.resolve(__dirname, "..", "config.env") });

const { runLocalStorageR2Backup } = require("../services/localStorageBackupService");

mongoose
  .connect(process.env.DB)
  .then(() => runLocalStorageR2Backup())
  .then(async (result) => {
    console.log(JSON.stringify(result));
    if (!result.configured) process.exitCode = 2;
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error.message);
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  });
