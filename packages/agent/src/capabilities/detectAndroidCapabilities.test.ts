import assert from "node:assert/strict";
import { test } from "node:test";
import { firstAndroidSdk } from "./detectAndroidCapabilities.js";

const onlyExisting = (present: string[]) => async (path: string) => present.some((p) => path.replaceAll("\\", "/") === `${p}/build-tools`);

test("firstAndroidSdk returns the first candidate that contains build-tools", async () => {
  const found = await firstAndroidSdk(["/missing", "/sdk-a", "/sdk-b"], onlyExisting(["/sdk-a", "/sdk-b"]));
  assert.equal(found, "/sdk-a");
});

test("firstAndroidSdk skips undefined candidates and returns undefined when none exist", async () => {
  assert.equal(await firstAndroidSdk([undefined, "/nope"], onlyExisting([])), undefined);
});
