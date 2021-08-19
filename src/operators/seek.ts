import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue, findNamedValue } from "../pipeline.js";
import { evaluateInternal } from "../index.js";

export default async function seek(
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
  return await evaluateInternal(
    args.slice(2),
    args,
    evalScope,
    input.map(x => {
      return new PipelineValue(
        (() => {
          const item = findNamedValue(args[1], x);
          return item instanceof PipelineValue ? item.value : item;
        })(),
        x
      );
    }),
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
