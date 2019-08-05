import { Seq } from "lazily-async";
import exception from "./exception";
import { EvaluationStack } from "./types";
import { PipelineItem, PipelineError, PipelineValue } from "./pipeline";
import { BashoEvalError } from ".";

async function unwrapNestedPromises(obj: any): Promise<any> {
  const resolved = Promise.resolve(obj);
  return resolved === obj ? obj : await unwrapNestedPromises(resolved);
}

export async function evalWithCatch(
  exp: string,
  evalScope: EvaluationStack
): Promise<(...args: Array<any>) => any> {
  try {
    const fn = eval(`k => (${exp})`)(evalScope.proxy);
    return async function() {
      try {
        const maybePromise = await fn.apply(undefined, arguments);
        return await unwrapNestedPromises(maybePromise);
      } catch (ex) {
        return new BashoEvalError(ex);
      }
    };
  } catch (ex) {
    return () => {
      return new BashoEvalError(ex);
    };
  }
}

export async function evalExpression(
  exp: string,
  evalScope: EvaluationStack,
  input: Seq<PipelineItem>,
  nextArgs: string[],
  isInitialInput: boolean
): Promise<Seq<PipelineItem>> {
  return isInitialInput
    ? await (async () => {
        const code = `() => (${exp})`;
        const fn = await evalWithCatch(code, evalScope);
        const input = await fn();
        return input instanceof BashoEvalError
          ? Seq.of([
              new PipelineError(
                `Failed to evaluate expression: ${exp}.`,
                input.error
              )
            ])
          : Array.isArray(input)
          ? Seq.of(input.map(i => new PipelineValue(i)))
          : Seq.of([new PipelineValue(input)]);
      })()
    : await (async () => {
        const code = `(x, i) => (${exp})`;
        return input.map(
          async (x, i): Promise<PipelineItem> =>
            x instanceof PipelineError
              ? x
              : x instanceof PipelineValue
              ? await (async () => {
                  const fn = await evalWithCatch(code, evalScope);
                  const result = await fn(await x.value, i);
                  return result instanceof BashoEvalError
                    ? new PipelineError(
                        `Failed to evaluate expression: ${exp}.`,
                        result.error,
                        x
                      )
                    : new PipelineValue(result, x);
                })()
              : exception(`Invalid item ${x} in pipeline.`)
        );
      })();
}
