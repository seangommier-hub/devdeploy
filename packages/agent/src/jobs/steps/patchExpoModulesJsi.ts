import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobLogLine } from "@devdeploy/core";

const RUNTIME_SWIFT = "expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift";
const PROMISE_SWIFT = "expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift";
const SCHEDULER_H = "expo-modules-jsi/apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h";
const NONISOLATED_WEAK_RUNTIME_FILES = [
  "expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptPropNameID.swift",
  "expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptError.swift",
  "expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptValue.swift",
];

async function replaceExactlyOnce(path: string, oldText: string, newText: string): Promise<void> {
  const content = await readFile(path, "utf8");
  const count = content.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`Expected exactly 1 match in ${path}, got ${count}, for:\n${oldText.slice(0, 120)}`);
  }
  await writeFile(path, content.replace(oldText, newText), "utf8");
}

async function findWeakLetFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findWeakLetFiles(path)));
    } else if (entry.isFile() && (await readFile(path, "utf8")).includes("weak let")) {
      matches.push(path);
    }
  }
  return matches;
}

/**
 * Ports the exact, CI-verified source patches from ADR-HEARTH-031 (see
 * .github/workflows/ios-unsigned-build.yml and patch-expo-modules-jsi.py in
 * the universal-remote repo) so a real Xcode 26.x build of an Expo SDK 57 app
 * doesn't hit the same upstream expo-modules-jsi compiler failures here.
 * These are workarounds for compiler/toolchain gaps inside expo-modules-jsi's
 * own source, not app code, and were already reasoned through and accepted
 * by Sean in that ADR — not new patches invented for this pipeline. Only
 * verified so far by "compiles", never on a real device (same caveat as the
 * ADR); re-apply is a no-op-safe overwrite since `npm ci` restores pristine
 * sources on every job.
 */
export async function patchExpoModulesJsi(workDir: string, onLog: (line: JobLogLine) => void): Promise<void> {
  const log = (text: string) => onLog({ timestamp: new Date().toISOString(), stream: "devdeploy", text });
  const nodeModules = join(workDir, "node_modules");
  const jsiRoot = join(nodeModules, "expo-modules-jsi");

  try {
    await readFile(join(jsiRoot, "package.json"), "utf8");
  } catch {
    log("No expo-modules-jsi in node_modules — skipping compiler-compatibility patches");
    return;
  }

  log("Patching expo-modules-jsi for this Xcode/Swift toolchain (ADR-HEARTH-031)");

  const weakLetFiles = await findWeakLetFiles(jsiRoot);
  for (const path of weakLetFiles) {
    const content = await readFile(path, "utf8");
    await writeFile(path, content.replaceAll("weak let", "weak var"), "utf8");
  }

  for (const relPath of NONISOLATED_WEAK_RUNTIME_FILES) {
    const path = join(nodeModules, relPath);
    await replaceExactlyOnce(
      path,
      "weak var runtime: JavaScriptRuntime?",
      "nonisolated(unsafe) weak var runtime: JavaScriptRuntime?",
    );
  }

  // Two constructors carry this annotation (see the ADR) — sed's non-global
  // `s///` still fixes both since it applies per line, so replaceAll here.
  const schedulerHPath = join(nodeModules, SCHEDULER_H);
  const schedulerH = await readFile(schedulerHPath, "utf8");
  await writeFile(schedulerHPath, schedulerH.replaceAll("SWIFT_RETURNS_RETAINED RuntimeScheduler(", "RuntimeScheduler("), "utf8");

  const runtimeSwiftPath = join(nodeModules, RUNTIME_SWIFT);
  await replaceExactlyOnce(
    runtimeSwiftPath,
    "if name.wholeMatch(of: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/) == nil {",
    "if name.wholeMatch(of: #/^[a-zA-Z_$][a-zA-Z0-9_$]*$/#) == nil {",
  );
  await replaceExactlyOnce(
    runtimeSwiftPath,
    `      let propertyName = String(cString: propertyName)
      nonisolated(unsafe) let resultPtr = resultPtr

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }
    }`,
    `      let propertyName = String(cString: propertyName)
      // Bit-pattern round-trip rather than a \`nonisolated(unsafe)\` capture — see
      // ADR-HEARTH-031 (universal-remote repo) for why.
      let resultPtrBits = UInt(bitPattern: resultPtr)

      return withGuaranteedContext(context) { (context: HostObjectContext, runtime) in
        return JavaScriptActor.assumeIsolated {
          let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
          return forwardingSwiftErrorsToJS(runtime: runtime) {
            try context.get(propertyName).writeJSIValue(to: resultPtr)
          }
        }
      }
    }`,
  );
  await replaceExactlyOnce(
    runtimeSwiftPath,
    `    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }`,
    `    let thisPtrBits = UInt(bitPattern: thisPtr)
    let argumentsPtrBits = UInt(bitPattern: argumentsPtr)
    let resultPtrBits = UInt(bitPattern: resultPtr)

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: HostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: thisPtrBits)!
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: argumentsPtrBits)!
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let this = UnsafeMutablePointer(mutating: thisPtr).move()
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptValue(runtime, this)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }`,
  );
  await replaceExactlyOnce(
    runtimeSwiftPath,
    `    nonisolated(unsafe) let thisPtr = thisPtr
    nonisolated(unsafe) let argumentsPtr = argumentsPtr
    nonisolated(unsafe) let resultPtr = resultPtr

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }`,
    `    let thisPtrBits = UInt(bitPattern: thisPtr)
    let argumentsPtrBits = UInt(bitPattern: argumentsPtr)
    let resultPtrBits = UInt(bitPattern: resultPtr)

    // See \`withGuaranteedContext\` for why neither the context nor the runtime is retained here, and
    // why the result is written to the caller's slot instead of being returned.
    return withGuaranteedContext(context) { (context: UnownedThisHostFunctionContext, runtime) in
      return JavaScriptActor.assumeIsolated {
        let thisPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: thisPtrBits)!
        let argumentsPtr = UnsafePointer<facebook.jsi.Value>(bitPattern: argumentsPtrBits)!
        let resultPtr = UnsafeMutablePointer<facebook.jsi.Value>(bitPattern: resultPtrBits)!
        return forwardingSwiftErrorsToJS(runtime: runtime) {
          let arguments = JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)
          let thisValue = JavaScriptUnownedValue(runtime.pointee, thisPtr)
          try context.call(thisValue, consume arguments).writeJSIValue(to: resultPtr)
        }
      }
    }
  }`,
  );

  await replaceExactlyOnce(
    join(nodeModules, PROMISE_SWIFT),
    `    let object = JavaScriptValue.Ref()
    let resolveFunction = JavaScriptValue.Ref()
    let rejectFunction = JavaScriptValue.Ref()

    func allowRelease() {`,
    `    let object = JavaScriptValue.Ref()
    let resolveFunction = JavaScriptValue.Ref()
    let rejectFunction = JavaScriptValue.Ref()

    // \`LongLivedState\` is \`@JavaScriptActor\`-isolated as a whole, but its implicit init would then
    // require callers to already be on that actor. It's actually safe to construct off-actor: the
    // stored properties' own inits (\`JavaScriptValue.Ref()\`) aren't themselves actor-isolated, so
    // there's nothing here that actually needs isolation at construction time.
    nonisolated init() {}

    func allowRelease() {`,
  );

  log(`Patched expo-modules-jsi: weak let->var (${weakLetFiles.length} files), nonisolated(unsafe) runtime refs, RuntimeScheduler.h, regex literal, sending-checker bit-pattern round-trips, LongLivedState init`);
}
