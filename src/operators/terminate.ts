import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalWithCatch } from "../eval";
import { BashoEvalError, evaluateInternal } from "..";

export default async function terminate(
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
  async function* asyncGenerator(): AsyncIterableIterator<PipelineItem> {
    const fn = await evalWithCatch(`(x, i) => (${expression})`, evalScope);
    let i = 0;
    for await (const x of input) {
      if (x instanceof PipelineValue) {
        const result = await fn(await x.value, i);
        if (result instanceof BashoEvalError) {
          return new PipelineError(
            `Failed to evaluate expression: ${expression}.`,
            result.error,
            x
          );
        }
        if (result === true) {
          return x;
        }
        yield x;
      } else {
        yield x;
      }
      i++;
    }
  }
  return await evaluateInternal(
    args.slice(2),
    args,
    evalScope,
    new Seq(asyncGenerator),
    mustPrint,
    onLog,
    onWrite,
    isInitialInput,
    isFirstParam,
    expressionStack
  );
}
