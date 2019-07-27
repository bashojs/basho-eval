import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue, PipelineError } from "../pipeline";
import child_process = require("child_process");
import * as util from "util";

import { evalWithCatch } from "../eval";
import exception from "../exception";
import { BashoEvalError, evaluateInternal } from "..";


const exec = util.promisify(child_process.exec);

function shellEscape(str: string): string {
  return str
    .replace(/([^A-Za-z0-9_\-.,:\/@\n])/g, "\\$1")
    .replace(/\n/g, "'\n'");
}

export async function shellCmd(
  template: string,
  evalStack: EvaluationStack,
  input: Seq<PipelineItem>,
  nextArgs: string[],
  isInitialInput: boolean
): Promise<Seq<PipelineItem>> {
  const fn = await evalWithCatch(`(x, i) => \`${template}\``, evalStack);
  return isInitialInput
    ? await (async () => {
        try {
          const cmd = await fn();
          return cmd instanceof BashoEvalError
            ? Seq.of([
                new PipelineError(
                  `Failed to execute shell command: ${template}`,
                  cmd.error
                )
              ])
            : await (async () => {
                const { stdout } = await exec(cmd);
                return Seq.of(
                  stdout
                    .split("\n")
                    .filter(x => x !== "")
                    .map(x => x.replace(/\n$/, ""))
                    .map(i => new PipelineValue(i))
                );
              })();
        } catch (ex) {
          return Seq.of([
            new PipelineError(
              `Failed to execute shell command: ${template}`,
              ex
            )
          ]);
        }
      })()
    : await (async () => {
        return input.map(
          async (x, i): Promise<PipelineItem> =>
            x instanceof PipelineError
              ? x
              : x instanceof PipelineValue
              ? await (async () => {
                  try {
                    const value = await x.value;
                    const cmd = await fn(
                      typeof value === "string" ? shellEscape(value) : value,
                      i
                    );
                    const { stdout } = await exec(cmd);
                    const items = stdout
                      .split("\n")
                      .filter(x => x !== "")
                      .map(x => x.replace(/\n$/, ""));
                    return new PipelineValue(
                      items.length === 1 ? items[0] : items,
                      x
                    );
                  } catch (ex) {
                    return new PipelineError(
                      `Failed to execute shell command: ${template}`,
                      ex,
                      x
                    );
                  }
                })()
              : exception(`Invalid item ${x} in pipeline.`)
        );
      })();
}


export default async function execShellCommand(
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
  return await evaluateInternal(
    args.slice(2),
    args,
    evalStack,
    await shellCmd(
      expression,
      evalStack,
      input,
      args.slice(2),
      isInitialInput
    ),
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
