import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseDevice, parseAdbDevices } from "./AdbInstaller.js";

const SAMPLE = `List of devices attached
R58M12ABCDE            device usb:1-1 product:e1q model:SM_S921U device:e1q transport_id:1
emulator-5554          unauthorized
* daemon started successfully *
`;

test("parseAdbDevices reads serial, state, and model and ignores daemon chatter", () => {
  assert.deepEqual(parseAdbDevices(SAMPLE), [
    { serial: "R58M12ABCDE", state: "device", model: "SM_S921U" },
    { serial: "emulator-5554", state: "unauthorized", model: undefined },
  ]);
});

test("parseAdbDevices returns nothing when no phone is attached", () => {
  assert.deepEqual(parseAdbDevices("List of devices attached\n\n"), []);
});

test("chooseDevice picks the only ready device", () => {
  assert.equal(chooseDevice(parseAdbDevices(SAMPLE)).serial, "R58M12ABCDE");
});

test("chooseDevice explains an unauthorized phone instead of installing", () => {
  assert.throws(() => chooseDevice(parseAdbDevices(SAMPLE), "emulator-5554"), /accept the USB debugging prompt/);
});

test("chooseDevice rejects a serial containing shell-looking characters", () => {
  assert.throws(() => chooseDevice(parseAdbDevices(SAMPLE), "abc; rm -rf /"), /Invalid device serial/);
});

test("chooseDevice refuses to guess when several devices are ready", () => {
  const two = [
    { serial: "A1", state: "device" },
    { serial: "B2", state: "device" },
  ];
  assert.throws(() => chooseDevice(two), /specify a serial/);
});

test("chooseDevice explains when nothing is connected", () => {
  assert.throws(() => chooseDevice([]), /plug the phone into the Pi/);
});
