import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import exception from "../exception";
import { BashoEvalError } from "..";

async function doFilter(
  exp: string,
  evalStack: EvaluationStack,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code, evalStack);
  return input.filter(
    async (x, i): Promise<boolean> =>
      x instanceof PipelineError
        ? true
        : x instanceof PipelineValue
        ? await (async () => {
            const result = await fn(await x.value, i);
            return result instanceof BashoEvalError ? true : result;
          })()
        : exception(`Invalid item ${x} in pipeline.`)
  );
}

export default async function filter(
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
  const expression = args[1];
  const filtered = await doFilter(expression, evalStack, input);
  return await evalShorthand(
    args.slice(2),
    args,
    evalStack,
    filtered,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
