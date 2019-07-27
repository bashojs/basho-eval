import { Constants, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineError, PipelineValue } from "../pipeline";
import { evalShorthand, evalWithCatch } from "../eval";
import { munch } from "../munch";
import exception from "../exception";
import { BashoEvalError } from "..";

async function doFilter(
  exp: string,
  constants: Constants,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code, constants);
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
  constants: Constants,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  isFirstParam: boolean,
  expressionStack: Array<ExpressionStackEntry>
) {
  const { cursor, expression } = munch(args.slice(1));
  const filtered = await doFilter(expression, constants, input);
  return await evalShorthand(
    args.slice(cursor + 1),
    args,
    constants,
    filtered,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
