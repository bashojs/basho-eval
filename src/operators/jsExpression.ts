import { Constants, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evalShorthand, evalExpression } from "../eval";
import { munch } from "../munch";

export default function jsExpression(expressionStartIndex: number) {
  return async (
    args: string[],
    prevArgs: string[],
    constants: Constants,
    input: Seq<PipelineItem>,
    mustPrint: boolean,
    onLog: BashoLogFn,
    onWrite: BashoLogFn,
    isInitialInput: boolean,
    isFirstParam: boolean,
    expressionStack: Array<ExpressionStackEntry>
  ) => {
    const { cursor, expression } = munch(args.slice(expressionStartIndex));
    return await evalShorthand(
      args.slice(cursor + expressionStartIndex),
      args,
      constants,
      await evalExpression(
        expression,
        constants,
        input,
        args.slice(cursor + expressionStartIndex),
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
