const { ConnectionString } = require("mongodb-connection-string-url");

function databaseIdentity(uri) {
  const parsed = new ConnectionString(uri);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!database) throw new Error("An explicit database name is required for Arena staging validation.");
  return { database, hosts: parsed.hosts.map((host) => host.toLowerCase().replace(/:27017$/, "")) };
}

function assertSeparateArenaStagingDatabase(stagingUri, operatingUri) {
  if (!stagingUri) throw new Error("ARENA_STAGING_DB is required. Production DB is never used as a fallback.");
  if (!operatingUri) throw new Error("DB is required for the operating-database comparison; no connection will be made to it.");
  const staging = databaseIdentity(stagingUri);
  const operating = databaseIdentity(operatingUri);
  // Credentials and query options do not identify a different database. Host
  // aliases still require operator verification and staging-scoped credentials.
  if (staging.database === operating.database && staging.hosts.some((host) => operating.hosts.includes(host))) {
    throw new Error("The staging connection must not target the configured operating database.");
  }
}

module.exports = { assertSeparateArenaStagingDatabase };
