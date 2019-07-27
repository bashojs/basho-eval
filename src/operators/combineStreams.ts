import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue, findNamedValue } from "../pipeline";
import { evaluateInternal } from "..";

export default async function combineStreams(
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
  return await evaluateInternal(
    args.slice(2),
    args,
    evalStack,
    input.map(x => {
      const streams = args[1].split(",");
      return new PipelineValue(
        streams.map(name => {
          const item = findNamedValue(name, x);
          return item instanceof PipelineValue ? item.value : item;
        }),
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
