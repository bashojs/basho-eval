import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evaluateInternal } from "..";

export default async function namedExpression(
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
  const newSeq = input.map(async (x, i) => x.clone(args[1]));
  return await evaluateInternal(
    args.slice(2),
    args,
    evalStack,
    newSeq,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack.concat({ name: args[1], args: prevArgs })
  );
}
