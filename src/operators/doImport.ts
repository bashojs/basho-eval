import path from "path";
import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline.js";
import { evaluateInternal } from "../index.js";
import * as util from "util";
import * as fs from "fs";

const stat = util.promisify(fs.stat);

async function exists(somePath: string) {
  try {
    const _ = await stat(somePath);
    return true;
  } catch {
    return false;
  }
}

export async function evalImport(
  pathToImport: string,
  name: string,
  alias: string
) {
  const isFile =
    pathToImport.endsWith(".js") ||
    pathToImport.endsWith(".cjs") ||
    pathToImport.endsWith(".mjs");

  if (isFile) {
    const fileToLoad = path.join(process.cwd(), pathToImport);
    (global as any)[alias] = (await import(fileToLoad))[name];
  } else {
    try {
      // First let's just try to import the module.
      (global as any)[alias] = (await import(pathToImport))[name];
    } catch {
      const pathInNodeModules = path.join(
        process.cwd(),
        "node_modules",
        pathToImport
      );

      // if that doesn't work, perhaps the module is added locally.
      if (await exists(pathInNodeModules)) {
        // See if main is defined in package.json
        const pkg = path.join(pathInNodeModules, "package.json");
        const packageJSON = JSON.parse(fs.readFileSync(pkg, "utf8"));
        const indexFile = packageJSON.main || "index.js";
        const fileToLoad = path.join(pathInNodeModules, indexFile);
        (global as any)[alias] = (await import(fileToLoad))[name];
      } else {
        throw new Error(`Unable to find module ${pathToImport}.`);
      }
    }
  }
}

export function defaultImport() {
  return async function doImport(
    args: string[],
    prevArgs: string[],
    evalScope: EvaluationStack,
    input: Seq<PipelineItem>,
    mustPrint: boolean,
    onLog: BashoLogFn,
    onWrite: BashoLogFn,
    isInitialInput: boolean,
    isFirstParam: boolean,
    expressionStack: Array<ExpressionStackEntry>
  ) {
    await evalImport(args[1], "default", args[2]);
    return await evaluateInternal(
      args.slice(3),
      args,
      evalScope,
      input,
      mustPrint,
      onLog,
      onWrite,
      isInitialInput,
      isFirstParam,
      expressionStack
    );
  };
}

export function namedImport() {
  return async function doImport(
    args: string[],
    prevArgs: string[],
    evalScope: EvaluationStack,
    input: Seq<PipelineItem>,
    mustPrint: boolean,
    onLog: BashoLogFn,
    onWrite: BashoLogFn,
    isInitialInput: boolean,
    isFirstParam: boolean,
    expressionStack: Array<ExpressionStackEntry>
  ) {
    await evalImport(args[1], args[2], args[3]);
    return await evaluateInternal(
      args.slice(4),
      args,
      evalScope,
      input,
      mustPrint,
      onLog,
      onWrite,
      isInitialInput,
      isFirstParam,
      expressionStack
    );
  };
}
