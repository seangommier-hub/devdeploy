import { execCapture } from "./execCommand.js";

/** Runs a probe command and returns its trimmed stdout, or undefined if the command is missing or fails. */
export async function tryCapture(command: string, args: string[]): Promise<string | undefined> {
  try {
    return await execCapture(command, args, process.cwd());
  } catch {
    return undefined;
  }
}
