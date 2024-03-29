import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline.js";
import { evalWithCatch } from "../eval.js";
import exception from "../exception.js";
import { BashoEvalError, evaluateInternal } from "../index.js";

async function doFlatMap(
  exp: string,
  evalScope: EvaluationStack,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `(x, i) => (${exp})`;
  const fn = evalWithCatch(code, evalScope);
  return input.flatMap(async (x, i) =>
    x instanceof PipelineError
      ? [x]
      : x instanceof PipelineValue
      ? await (async () => {
          const result: Array<any> | BashoEvalError = await fn(
            await x.value,
            i
          );
          return result instanceof BashoEvalError
            ? [
                new PipelineError(
                  `Error while evaluating expression: ${exp}.`,
                  result.error,
                  x
                ) as PipelineItem
              ]
            : result.map((r: any) => new PipelineValue(r, x));
        })()
      : exception(`Invalid item ${x} in pipeline.`)
  );
}

export default async function flatMap(
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
  const mapped = await doFlatMap(expression, evalScope, input);
  return await evaluateInternal(
    args.slice(2),
    args,
    evalScope,
    mapped,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
