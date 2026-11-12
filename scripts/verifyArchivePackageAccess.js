const assert = require("node:assert/strict");
const { ArchiveFolder } = require("../models/matthsModel");
const { normalizeArchiveAccessLevel, isPublishedArchiveFolder } = require("../services/archiveService");

for (const legacyValue of ["", "AUTHENTICATED", "MOCK_EXAM_PACKAGE", "PRO"]) {
  assert.equal(normalizeArchiveAccessLevel(legacyValue), "AUTHENTICATED");
}
assert.deepEqual(ArchiveFolder.schema.path("accessLevel").enumValues, ["AUTHENTICATED", "MOCK_EXAM_PACKAGE", "PRO"]);

const root = { _id: "root", accessLevel: "PRO", isPublished: true };
const child = { _id: "child", accessLevel: "MOCK_EXAM_PACKAGE", parentFolderId: "root", isPublished: true };
const folders = new Map([["root", root], ["child", child]]);
assert.equal(isPublishedArchiveFolder(child, folders), true);
root.isPublished = false;
assert.equal(isPublishedArchiveFolder(child, folders), false);
root.isPublished = true;
root.parentFolderId = "child";
assert.equal(isPublishedArchiveFolder(child, folders), false);
assert.equal(isPublishedArchiveFolder(child, new Map([["child", child]])), false);
console.log("Archive access verified: published legacy folders are free and hidden or invalid ancestors remain inaccessible.");
