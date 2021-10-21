import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue } from "../pipeline.js";
import { evaluateInternal } from "../index.js";

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
        items.map((x) => (x instanceof PipelineValue ? x.value : x)).join("\n")
      ),
    ]),
    mustPrint,
    onLog,
    onWrite,
    isInitialInput,
    isFirstParam,
    expressionStack
  );
}
