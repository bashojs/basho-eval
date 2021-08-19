import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types.js";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline.js";
import {  evalExpression } from "../eval.js";
import { evaluateInternal } from "../index.js";

export default function jsExpression(expressionStartIndex: number) {
  return async (
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
  ) => {
    const expression = args[expressionStartIndex];
    return await evaluateInternal(
      args.slice(expressionStartIndex + 1),
      args,
      evalScope,
      await evalExpression(
        expression,
        evalScope,
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
