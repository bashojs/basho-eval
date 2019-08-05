import { Seq } from "lazily-async";
import exception from "./exception";
import {
  EvaluationStack,
  BashoEvaluationResult,
  BashoLogFn,
  ExpressionStackEntry
} from "./types";
import { PipelineItem, PipelineError, PipelineValue } from "./pipeline";
import { evaluateInternal, BashoEvalError } from ".";

export async function evalWithCatch(
  exp: string,
  evalScope: EvaluationStack
): Promise<(...args: Array<any>) => any> {
  try {
    const fn = eval(`k => ${exp}`)(evalScope.proxy);
    return async function() {
      try {
        return await fn.apply(undefined, arguments);
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
        const code = `async () => (${exp})`;
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
        const code = `async (x, i) => (${exp})`;
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

