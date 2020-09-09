import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue } from "../pipeline";
import { evaluateInternal } from "..";

export default async function asString(
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
  const items = await input.toArray();
  return await evaluateInternal(
    args.slice(1),
    args,
    evalScope,
    Seq.of([
      new PipelineValue(
        items.map((x) => (x instanceof PipelineValue ? x.value : x)).join("")
      ),
    ]),
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
