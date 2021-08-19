import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline.js";
import { evalWithCatch } from "../eval.js";
import { evaluateInternal } from "../index.js";

export default async function defineExpression(
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
  const name = args[1];
  const expression = args[2];
  const evalResult = await evalWithCatch(
    `k => (${expression})`,
    evalScope
  )(evalScope.proxy);
  evalScope.proxy[name] = evalResult;
  return await evaluateInternal(
    args.slice(3),
    args,
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
