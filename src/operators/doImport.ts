import path = require("path");
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

export async function importModule(
  filePath: string,
  alias: string,
  isRelative: boolean
) {
  if (isRelative) {
    (global as any)[alias] = require(filePath);
  } else {
    if (await exists(path.join(process.cwd(), "node_modules", filePath))) {
      (global as any)[alias] = require(path.join(
        process.cwd(),
        "node_modules",
        filePath
      ));
    } else {
      (global as any)[alias] = require(filePath);
    }
  }
}


async function evalImport(filename: string, alias: string) {
  const isRelative =
    filename.startsWith("./") ||
    filename.startsWith("../") ||
    filename.endsWith(".js");
  const filePath = isRelative ? path.join(process.cwd(), filename) : filename;
  await importModule(filePath, alias, isRelative);
}

export default async function doImport(
  args: string[],
  prevArgs: string[],
  evalStack: EvaluationStack,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  isFirstParam: boolean,
  expressionStack: Array<ExpressionStackEntry>
) {
  await evalImport(args[1], args[2]);
  return await evaluateInternal(
    args.slice(3),
    args,
    evalStack,
    input,
    mustPrint,
    onLog,
    onWrite,
    isInitialInput,
    isFirstParam,
    expressionStack
  );
}
