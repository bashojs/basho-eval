import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { getPrinter } from "../printer";

export default async function write(
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
  return getPrinter(onWrite)(
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
