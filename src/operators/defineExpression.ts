import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import { munch } from "../munch";

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
  const { cursor, expression } = munch(args.slice(2));
  evalStack.proxy[args[1]] = eval(`k => ${expression}`)(evalStack.proxy);
  evalWithCatch(expression, evalStack);
  return await evalShorthand(
    args.slice(cursor + 2),
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
