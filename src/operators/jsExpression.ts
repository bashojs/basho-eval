import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evalShorthand, evalExpression } from "../eval";

export default function jsExpression(expressionStartIndex: number) {
  return async (
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
  ) => {
    const expression = args[expressionStartIndex];
    return await evalShorthand(
      args.slice(expressionStartIndex + 1),
      args,
      evalStack,
      await evalExpression(
        expression,
        evalStack,
        input,
        args.slice(expressionStartIndex + 1),
        isInitialInput
      ),
      mustPrint,
      onLog,
      onWrite,
      false,
      false,
      expressionStack
    );
  };
}
