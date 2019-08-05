import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalWithCatch } from "../eval";
import { BashoEvalError, evaluateInternal } from "..";

export default async function onError(
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
  const expression = args[1];
  const newSeq = input.map(async (x, i) => {
    const fn = await evalWithCatch(
      `async (x, i) => (${expression})`,
      evalScope
    );
    return x instanceof PipelineError
      ? await (async () => {
          const result = await fn(x, i);
          return result instanceof BashoEvalError
            ? new PipelineError(
                `Failed to evaluate error expression: ${expression}.`,
                result.error,
                x
              )
            : new PipelineValue(result, x);
        })()
      : x;
  });

  return await evaluateInternal(
    args.slice(2),
    args,
    evalScope,
    newSeq,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
