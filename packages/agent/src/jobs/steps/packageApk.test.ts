import assert from "node:assert/strict";
import { test } from "node:test";
import { pickApk } from "./packageApk.js";

test("pickApk prefers the installable APK over an unsigned one", () => {
  assert.equal(pickApk(["app-release-unsigned.apk", "app-release.apk", "output-metadata.json"]), "app-release.apk");
});

test("pickApk falls back to an unsigned APK when it is the only one", () => {
  assert.equal(pickApk(["app-release-unsigned.apk"]), "app-release-unsigned.apk");
});

test("pickApk returns undefined when the build produced no APK", () => {
  assert.equal(pickApk(["output-metadata.json"]), undefined);
});
