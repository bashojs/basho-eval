import path from "path";
import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import * as util from "util";
import * as fs from "fs";
import { PipelineItem } from "../pipeline";
import { evaluateInternal } from "..";

const stat = util.promisify(fs.stat);

async function exists(somePath: string) {
  try {
    const _ = await stat(somePath);
    return true;
  } catch {
    return false;
  }
}

async function importModule(
  filePath: string,
  name: string,
  alias: string,
  isRelative: boolean
) {
  if (isRelative) {
    (global as any)[alias] = (await import(filePath))[name];
  } else {
    const pathInNodeModules = path.join(
      process.cwd(),
      "node_modules",
      filePath
    );
    if (await exists(pathInNodeModules)) {
      (global as any)[alias] = (await import(pathInNodeModules))[name];
    } else {
      (global as any)[alias] = (await import(filePath))[name];
    }
  }
}

async function evalImport(filename: string, name: string, alias: string) {
  const isRelative =
    filename.startsWith("./") ||
    filename.startsWith("../") ||
    filename.endsWith(".js");
  const filePath = isRelative ? path.join(process.cwd(), filename) : filename;
  await importModule(filePath, name, alias, isRelative);
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
  }
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
  }
}
