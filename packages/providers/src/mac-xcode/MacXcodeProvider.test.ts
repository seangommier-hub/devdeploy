import assert from "node:assert/strict";
import { test } from "node:test";
import { Platform, type BuildProfile } from "@devdeploy/core";
import { MacXcodeProvider } from "./MacXcodeProvider.js";

const profileFor = (platform: BuildProfile["platform"]): BuildProfile => ({
  id: "p",
  name: "p",
  platform,
  distribution: "development",
  providerPriority: [],
  requireCostAuthorization: true,
});

const provider = new MacXcodeProvider();

test("claims Android only when the agent reports both a JDK and an Android SDK", () => {
  assert.equal(provider.canHandle(profileFor(Platform.ANDROID), { platforms: [], hasJava: true, hasAndroidSdk: true }), true);
  assert.equal(provider.canHandle(profileFor(Platform.ANDROID), { platforms: [], hasJava: true }), false);
  assert.equal(provider.canHandle(profileFor(Platform.ANDROID), { platforms: [], hasAndroidSdk: true }), false);
});

test("still claims iOS on Xcode alone and does not claim Android just because Xcode exists", () => {
  assert.equal(provider.canHandle(profileFor(Platform.IOS), { platforms: [], hasXcode: true }), true);
  assert.equal(provider.canHandle(profileFor(Platform.ANDROID), { platforms: [], hasXcode: true }), false);
});

test("does not claim web or generic platforms", () => {
  assert.equal(provider.canHandle(profileFor(Platform.WEB), { platforms: [], hasXcode: true, hasJava: true, hasAndroidSdk: true }), false);
});
