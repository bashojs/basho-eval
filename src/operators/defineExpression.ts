import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";

export default async function defineExpression(
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
  const [name, expression] = args.slice(1);
  evalStack.proxy[name] = eval(`k => ${expression}`)(evalStack.proxy);
  evalWithCatch(expression, evalStack);
  return await evalShorthand(
    args.slice(3),
    args,
    evalStack,
    input,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
