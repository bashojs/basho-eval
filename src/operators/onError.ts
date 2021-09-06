import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline.js";
import { evalWithCatch } from "../eval.js";
import { BashoEvalError, evaluateInternal } from "../index.js";

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
    const fn = evalWithCatch(`(x, i) => (${expression})`, evalScope);
    return x instanceof PipelineError
      ? await (async () => {
          const result = await fn(x, i);
          return result instanceof BashoEvalError
            ? new PipelineError(
                `Error while evaluating error expression: ${expression}.`,
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
    isInitialInput,
    isFirstParam,
    expressionStack
  );
}
