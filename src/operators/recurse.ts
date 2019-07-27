import { Constants, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import { munch } from "../munch";
import { evaluateInternal } from "..";

export default async function recurse(
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
  const name = args[1];
  const { cursor, expression } = munch(args.slice(2));
  const recursePoint = expressionStack.find(e => e.name === name);
  const fn = await evalWithCatch(`(x, i) => (${expression})`, constants);
  const newSeq = input.map(async (x, i) =>
    recursePoint
      ? x instanceof PipelineValue
        ? await (async () => {
            const predicateResult = await fn(await x.value, i);
            return predicateResult === true
              ? await (async () => {
                  const recurseArgs = recursePoint.args.slice(
                    0,
                    recursePoint.args.length - (args.length - (cursor + 2))
                  );
                  const innerEvalResult = await evaluateInternal(
                    recurseArgs,
                    [],
                    constants,
                    Seq.of([x]),
                    mustPrint,
                    onLog,
                    onWrite,
                    false,
                    false,
                    []
                  );
                  const results = await innerEvalResult.result.toArray();
                  const result = results[0];
                  return result instanceof PipelineValue
                    ? new PipelineValue(result.value, x)
                    : result;
                })()
              : x;
          })()
        : x
      : new PipelineError(
          `The expression ${name} was not found.`,
          new Error(`Missing expression ${name}.`),
          x
        )
  );
  return await evalShorthand(
    args.slice(cursor + 2),
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
