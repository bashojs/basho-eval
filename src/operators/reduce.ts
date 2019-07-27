import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import exception from "../exception";
import { BashoEvalError } from "..";

async function doReduce(
  exp: string,
  evalStack: EvaluationStack,
  input: Seq<PipelineItem>,
  initialValueExp: string
): Promise<PipelineItem> {
  const code = `async (acc, x, i) => (${exp})`;
  const fn = await evalWithCatch(code, evalStack);
  const initialValueCode = `async () => (${initialValueExp})`;
  const getInitialValue = await evalWithCatch(initialValueCode, evalStack);

  const initialValue = await getInitialValue();
  const output =
    initialValue instanceof BashoEvalError
      ? new PipelineError(
          `Failed to evaluate expression: ${initialValue}.`,
          initialValue.error
        )
      : await input.reduce(
          async (acc: any, x, i): Promise<any> =>
            acc instanceof PipelineError
              ? acc
              : x instanceof PipelineError
              ? x
              : x instanceof PipelineValue
              ? await (async () => {
                  const result = await fn(acc, await x.value, i);
                  return result instanceof BashoEvalError
                    ? new PipelineError(
                        `Failed to evaluate expression: ${exp}.`,
                        result.error,
                        x
                      )
                    : result;
                })()
              : exception(`Invalid item ${x} in pipeline.`),
          initialValue
        );
  return output instanceof PipelineError ? output : new PipelineValue(output);
}

export default async function reduce(
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
  const [expression, initialValue] = args.slice(1);
  return await (async () => {
    const reduced = await doReduce(expression, evalStack, input, initialValue);
    return await evalShorthand(
      args.slice(3),
      args,
      evalStack,
      Seq.of([reduced]),
      mustPrint,
      onLog,
      onWrite,
      false,
      false,
      expressionStack
    );
  })();
}
