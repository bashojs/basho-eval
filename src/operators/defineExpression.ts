import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evalWithCatch } from "../eval";
import { evaluateInternal } from "..";

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
  evalScope.proxy[name] = eval(`k => ${expression}`)(evalScope.proxy);
  evalWithCatch(expression, evalScope);
  return await evaluateInternal(
    args.slice(3),
    args,
    evalScope,
    input,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
