import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evaluateInternal } from "..";

export default async function print(
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
    args.slice(1),
    args,
    evalStack,
    input,
    false,
    onLog,
    onWrite,
    isInitialInput,
    isFirstParam,
    expressionStack
  );
}
