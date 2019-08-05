import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { getPrinter } from "../printer";

export default async function log(
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
  return getPrinter(onLog)(
    args,
    prevArgs,
    evalScope,
    input,
    mustPrint,
    onLog,
    onWrite,
    isInitialInput,
    isFirstParam,
    expressionStack
  );
}
