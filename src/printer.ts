import { BashoLogFn, EvaluationStack, ExpressionStackEntry } from "./types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue } from "./pipeline";
import { evalWithCatch } from "./eval";
import { BashoEvalError, evaluateInternal } from ".";

export function getPrinter(printFn: BashoLogFn) {
  return async (
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
  ) => {
    const expression = args[1];
    const fn = await evalWithCatch(`(x, i) => (${expression})`, evalScope);
    const newSeq = input.map(async (x, i) => {
      if (x instanceof PipelineValue) {
        const result = await fn(await x.value, i);
        printFn(
          result instanceof BashoEvalError
            ? `Failed to evaluate expression: ${expression}.`
            : result
        );
      }
      return x;
    });
    return await evaluateInternal(
      args.slice(2),
      args,
      evalScope,
      newSeq,
      mustPrint,
      onLog,
      onWrite,
      isInitialInput,
      false,
      expressionStack
    );
  };
}
