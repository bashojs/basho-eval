import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import { munch } from "../munch";
import exception from "../exception";
import { BashoEvalError } from "..";

async function doFlatMap(
  exp: string,
  evalStack: EvaluationStack,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code, evalStack);
  return input.flatMap(async (x, i) =>
    x instanceof PipelineError
      ? [x]
      : x instanceof PipelineValue
      ? await (async () => {
          const result: Array<any> | BashoEvalError = await fn(await x.value, i);
          return result instanceof BashoEvalError
            ? [
                new PipelineError(
                  `Failed to evaluate expression: ${exp}.`,
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
  evalStack: EvaluationStack,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  isFirstParam: boolean,
  expressionStack: Array<ExpressionStackEntry>
) {
  const { cursor, expression } = munch(args.slice(1));
  const mapped = await doFlatMap(expression, evalStack, input);
  return await evalShorthand(
    args.slice(cursor + 1),
    args,
    evalStack,
    mapped,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
