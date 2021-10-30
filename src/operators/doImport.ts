import path from "path";
import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline.js";
import { evaluateInternal } from "../index.js";

export async function evalImport(
  filename: string,
  name: string,
  alias: string
) {
  const isRelative =
    filename.startsWith("./") ||
    filename.startsWith("../") ||
    filename.endsWith(".js");
  const filePath = isRelative ? path.join(process.cwd(), filename) : filename;
  (global as any)[alias] = (await import(filePath))[name];
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
