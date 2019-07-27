import { Constants, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import { munch } from "../munch";
import { BashoEvalError } from "..";

export default async function onError(
  args: string[],
  prevArgs: string[],
  constants: Constants,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  isFirstParam: boolean,
  expressionStack: Array<ExpressionStackEntry>
) {
  const { cursor, expression } = munch(args.slice(1));
  const newSeq = input.map(async (x, i) => {
    const fn = await evalWithCatch(
      `async (x, i) => (${expression})`,
      constants
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

  return await evalShorthand(
    args.slice(cursor + 1),
    args,
    constants,
    newSeq,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
