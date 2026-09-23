import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ADB_TIMEOUT_MS = 120_000;
const DEVICE_LIST_HEADER = "List of devices attached";
const READY_STATE = "device";
const SERIAL_PATTERN = /^[\w.:-]+$/;

export interface AndroidDevice {
  serial: string;
  /** adb state: "device" (ready), "unauthorized" (phone hasn't accepted this computer), "offline", ... */
  state: string;
  model?: string;
}

/** Parses `adb devices -l` output into structured devices. */
export function parseAdbDevices(output: string): AndroidDevice[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== DEVICE_LIST_HEADER && !line.startsWith("*"))
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);
      const model = details.find((detail) => detail.startsWith("model:"))?.slice("model:".length);
      return { serial, state, model };
    });
}

/** Chooses which device to install to: the requested serial, or the only ready device. Throws with a clear reason otherwise. */
export function chooseDevice(devices: AndroidDevice[], requestedSerial?: string): AndroidDevice {
  if (requestedSerial) {
    if (!SERIAL_PATTERN.test(requestedSerial)) throw new Error(`Invalid device serial "${requestedSerial}"`);
    const match = devices.find((device) => device.serial === requestedSerial);
    if (!match) throw new Error(`Device ${requestedSerial} is not connected to the Pi`);
    if (match.state !== READY_STATE) throw new Error(`Device ${requestedSerial} is "${match.state}" — unlock the phone and accept the USB debugging prompt`);
    return match;
  }
  const ready = devices.filter((device) => device.state === READY_STATE);
  if (ready.length === 0) throw new Error("No Android device ready — plug the phone into the Pi, enable USB debugging, and accept the prompt");
  if (ready.length > 1) throw new Error(`${ready.length} Android devices are ready — specify a serial`);
  return ready[0];
}

/** Installs APKs onto Android phones plugged into this machine (the Pi) using adb. */
export class AdbInstaller {
  async listDevices(): Promise<AndroidDevice[]> {
    const { stdout } = await execFileAsync("adb", ["devices", "-l"], { timeout: ADB_TIMEOUT_MS });
    return parseAdbDevices(stdout);
  }

  async install(apkPath: string, requestedSerial?: string): Promise<{ device: AndroidDevice; output: string }> {
    const device = chooseDevice(await this.listDevices(), requestedSerial);
    const { stdout } = await execFileAsync("adb", ["-s", device.serial, "install", "-r", apkPath], { timeout: ADB_TIMEOUT_MS });
    return { device, output: stdout.trim() };
  }
}
