import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue, findNamedValue } from "../pipeline";
import { evalShorthand } from "../eval";

export default async function seek(
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
  return await evalShorthand(
    args.slice(2),
    args,
    evalStack,
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
