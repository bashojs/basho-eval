import path = require("path");
import child_process = require("child_process");
import promisify = require("nodefunc-promisify");
import { Seq, sequence } from "lazily-async";

import exception from "./exception";
import importModule = require("./import-module");

const exec = promisify(child_process.exec);

// prettier-ignore
/* Options: */
const options = [
  "-a",         //            treat array as a whole
  "-c",         // n1,n2,n3   combine a named stages
  "-e",         //            shell command
  "-f",         //            filter
  "-i",         //            import a file or module
  "-j",         //            JS expression
  "-l",         //            evaluate and log a value to console
  "-m",         //            flatMap
  "-n",         //            Named result
  "-q",         //            quote expression as string
  "-p",         //            print
  "-r",         //            reduce
  "-t",         //            terminate evaluation
  "-w",         //            Same as log, but without the newline
  "--error",    //            Error handling
];

class QuotedExpression {
  str: Array<string>;

  constructor(str: Array<string>) {
    this.str = str;
  }
}

export abstract class PipelineItem {
  previousItem?: PipelineItem;
  name?: string;

  constructor(previousItem?: PipelineItem, name?: string) {
    this.previousItem = previousItem;
    this.name = name;
  }

  abstract clone(name: string): PipelineItem;
}

export class PipelineValue extends PipelineItem {
  value: any;

  constructor(value: any, previousItem?: PipelineItem, name?: string) {
    super(previousItem, name);
    this.value = value;
  }

  clone(name: string): PipelineValue {
    return new PipelineValue(this.value, this.previousItem, name);
  }
}

export class PipelineError extends PipelineItem {
  message: string;
  error: any;

  constructor(
    message: string,
    error: any,
    previousItem?: PipelineItem,
    name?: string
  ) {
    super(previousItem, name);
    this.message = message;
    this.error = error;
  }

  clone(name: string): PipelineError {
    return new PipelineError(this.message, this.error, this.previousItem, name);
  }
}

class EvalError {
  error: any;

  constructor(error: any) {
    this.error = error;
  }
}

async function evalWithCatch(
  exp: string
): Promise<(...args: Array<any>) => any> {
  try {
    const fn = await eval(exp);
    return async function() {
      try {
        return await fn.apply(undefined, arguments);
      } catch (ex) {
        return new EvalError(ex);
      }
    };
  } catch (ex) {
    return () => {
      return new EvalError(ex);
    };
  }
}

function shellEscape(str: string): string {
  return str
    .replace(/([^A-Za-z0-9_\-.,:\/@\n])/g, "\\$1")
    .replace(/\n/g, "'\n'");
}

async function evalExpression(
  exp: string,
  input: Seq<PipelineItem>,
  nextArgs: Array<string>,
  isInitialInput: boolean
): Promise<Seq<PipelineItem>> {
  return isInitialInput
    ? await (async () => {
        const code = `async () => (${exp})`;
        const fn = await evalWithCatch(code);
        const input = await fn();
        return input instanceof EvalError
          ? Seq.of([
              new PipelineError(
                `basho failed to evaluate expression: ${exp}.`,
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
                    const fn = await evalWithCatch(code);
                    const result = await fn(await x.value, i);
                    return result instanceof EvalError
                      ? new PipelineError(
                          `basho failed to evaluate expression: ${exp}.`,
                          result.error,
                          x
                        )
                      : new PipelineValue(result, x);
                  })()
                : exception(`Invalid item ${x} in pipeline.`)
        );
      })();
}

async function shellCmd(
  template: string,
  input: Seq<PipelineItem>,
  nextArgs: Array<string>,
  isInitialInput: boolean
): Promise<Seq<PipelineItem>> {
  const fn = await evalWithCatch(`async (x, i) => \`${template}\``);
  return isInitialInput
    ? await (async () => {
        try {
          const cmd = await fn();
          return cmd instanceof EvalError
            ? Seq.of([
                new PipelineError(
                  `basho failed to execute shell command: ${template}`,
                  cmd.error
                )
              ])
            : await (async () => {
                const shellResult: string = await exec(cmd);
                return Seq.of(
                  shellResult
                    .split("\n")
                    .filter(x => x !== "")
                    .map(x => x.replace(/\n$/, ""))
                    .map(i => new PipelineValue(i))
                );
              })();
        } catch (ex) {
          return Seq.of([
            new PipelineError(
              `basho failed to execute shell command: ${template}`,
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
                      const shellResult: string = await exec(cmd);
                      const items = shellResult
                        .split("\n")
                        .filter(x => x !== "")
                        .map(x => x.replace(/\n$/, ""));
                      return new PipelineValue(
                        items.length === 1 ? items[0] : items,
                        x
                      );
                    } catch (ex) {
                      return new PipelineError(
                        `basho failed to execute shell command: ${template}`,
                        ex
                      );
                    }
                  })()
                : exception(`Invalid item ${x} in pipeline.`)
        );
      })();
}

function evalImport(filename: string, alias: string): void {
  const filePath =
    filename.startsWith("./") ||
    filename.startsWith("../") ||
    filename.endsWith(".js")
      ? path.join(process.cwd(), filename)
      : filename;
  importModule(filePath, alias);
}

async function filter(
  exp: string,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code);
  return input.filter(
    async (x, i): Promise<boolean> =>
      x instanceof PipelineError
        ? true
        : x instanceof PipelineValue
          ? await (async () => {
              const result = await fn(await x.value, i);
              return result instanceof EvalError ? true : result;
            })()
          : exception(`Invalid item ${x} in pipeline.`)
  );
}

async function flatMap(
  exp: string,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code);
  return input.flatMap(
    async (x, i) =>
      x instanceof PipelineError
        ? [x]
        : x instanceof PipelineValue
          ? await (async () => {
              const result: Array<any> | EvalError = await fn(await x.value, i);
              return result instanceof EvalError
                ? new PipelineError(
                    `basho failed to evaluate expression: ${exp}.`,
                    result.error,
                    x
                  )
                : result.map((r: any) => new PipelineValue(r, x));
            })()
          : exception(`Invalid item ${x} in pipeline.`)
  );
}

async function reduce(
  exp: string,
  input: Seq<PipelineItem>,
  initialValueExp: string
): Promise<PipelineItem> {
  const code = `async (acc, x, i) => (${exp})`;
  const fn = await evalWithCatch(code);
  const initialValueCode = `async () => (${initialValueExp})`;
  const getInitialValue = await evalWithCatch(initialValueCode);

  const initialValue = await getInitialValue();
  const output =
    initialValue instanceof EvalError
      ? new PipelineError(
          `basho failed to evaluate expression: ${initialValue}.`,
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
                      return result instanceof EvalError
                        ? new PipelineError(
                            `basho failed to evaluate expression: ${exp}.`,
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

type MunchResult = {
  cursor: number;
  expression: QuotedExpression | Array<string>;
};

/* Consume parameters until we reach an option flag (-p, -e etc) */
function munch(parts: Array<string>): MunchResult {
  function doMunch(
    parts: Array<string>,
    munchResult: Array<string>,
    cursor: number
  ): { cursor: number; munchResult: Array<string> } {
    return !parts.length || options.includes(parts[0])
      ? { cursor, munchResult }
      : doMunch(parts.slice(1), munchResult.concat(parts[0]), cursor + 1);
  }

  return parts[0] === "-q"
    ? (() => {
        const { cursor, munchResult } = doMunch(parts.slice(1), [], 1);
        return { cursor, expression: new QuotedExpression(munchResult) };
      })()
    : (() => {
        const { cursor, munchResult } = doMunch(parts, [], 0);
        return { cursor, expression: munchResult };
      })();
}

function toExpressionString(args: QuotedExpression | Array<string>): string {
  return args instanceof QuotedExpression
    ? `"${args.str.join(" ")}"`
    : args.join(" ");
}

function findNamedValue(
  name: string,
  pipelineItem?: PipelineItem
): PipelineItem | undefined {
  return typeof pipelineItem !== "undefined"
    ? pipelineItem.name === name
      ? pipelineItem
      : findNamedValue(name, pipelineItem.previousItem)
    : undefined;
}
export type BashoLogFn = (msg: string) => void;
export type BashoEvaluationResult = {
  mustPrint: boolean;
  result: Seq<PipelineItem>;
};

export async function evaluate(
  args: Array<string>,
  mustPrint: boolean = true,
  onLog: BashoLogFn = () => {},
  onWrite: BashoLogFn = () => {}
) {
  return await evaluateInternal(
    args,
    Seq.of([]),
    mustPrint,
    onLog,
    onWrite,
    true
  );
}

async function evaluateInternal(
  args: Array<string>,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput = false
): Promise<BashoEvaluationResult> {
  const cases: Array<[(arg: string) => boolean, () => Promise<any>]> = [
    /* Enumerate sequence into an array */
    [
      x => x === "-a",
      async () => {
        const items = await input.toArray();
        return await evalShorthand(
          args.slice(1),
          Seq.of([
            new PipelineValue(
              items.map(x => (x instanceof PipelineValue ? x.value : x))
            )
          ])
        );
      }
    ],

    /* Combine multiple named streams */
    [
      x => x === "-c",
      async () =>
        await evalShorthand(
          args.slice(2),
          input.map(
            x =>
              new PipelineValue(
                args[1].split(",").map(name => {
                  const item = findNamedValue(name, x);
                  return item instanceof PipelineValue ? item.value : item;
                }),
                x
              )
          )
        )
    ],

    /* Execute shell command */
    [
      x => x === "-e",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        return await evalShorthand(
          args.slice(cursor + 1),
          await shellCmd(
            toExpressionString(expression),
            input,
            args.slice(cursor + 1),
            isInitialInput
          )
        );
      }
    ],

    /* Error handling */
    [
      x => x === "--error",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const newSeq = input.map(async (x, i) => {
          const fn = await evalWithCatch(`async (x, i) => (${expression})`);
          return x instanceof PipelineError
            ? await (async () => {
                const result = await fn(x, i);
                return result instanceof EvalError
                  ? new PipelineError(
                      `basho failed to evaluate error expression: ${
                        expression
                      }.`,
                      result.error,
                      x
                    )
                  : new PipelineValue(result, x);
              })()
            : x;
        });

        return await evalShorthand(args.slice(cursor + 1), newSeq);
      }
    ],

    /* Filter */
    [
      x => x === "-f",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const filtered = await filter(toExpressionString(expression), input);
        return await evalShorthand(args.slice(cursor + 1), filtered);
      }
    ],

    /* Named Export */
    [
      x => x === "-i",
      async () => {
        evalImport(args[1], args[2]);
        return await evalShorthand(args.slice(3), input);
      }
    ],

    /* JS expressions */
    [
      x => x === "-j",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        return await evalShorthand(
          args.slice(cursor + 1),
          await evalExpression(
            toExpressionString(expression),
            input,
            args.slice(cursor + 1),
            isInitialInput
          )
        );
      }
    ],

    /* Logging */
    [x => x === "-l", getPrinter(onLog)(input, args, evalShorthand)],

    /* Flatmap */
    [
      x => x === "-m",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const mapped = await flatMap(toExpressionString(expression), input);
        return await evalShorthand(args.slice(cursor + 1), mapped);
      }
    ],

    /* Named Expressions */
    [
      x => x === "-n",
      async () => {
        const newSeq = input.map(async (x, i) => x.clone(args[1]));
        return await evalShorthand(args.slice(2), newSeq);
      }
    ],

    /* Error handling. Handled by shell, ignore */
    [
      x => x === "--ignoreerror" || x === "--printerror",
      async () =>
        await evaluateInternal(
          args.slice(1),
          input,
          mustPrint,
          onLog,
          onWrite,
          isInitialInput
        )
    ],

    /* Print */
    [
      x => x === "-p",
      async () =>
        await evaluateInternal(
          args.slice(1),
          input,
          false,
          onLog,
          onWrite,
          isInitialInput
        )
    ],

    /* Reduce */
    [
      x => x === "-r",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        return !(expression instanceof QuotedExpression)
          ? await (async () => {
              const initialValue = expression.slice(-1)[0];
              const reduced = await reduce(
                toExpressionString(expression.slice(0, -1)),
                input,
                initialValue
              );
              return await evalShorthand(
                args.slice(cursor + 1),
                Seq.of([reduced])
              );
            })()
          : exception(
              `A quoted expression cannot be used with the reduce option.`
            );
      }
    ],

    /* Terminate the pipeline */
    [
      x => x === "-t",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        async function* asyncGenerator(): AsyncIterableIterator<PipelineItem> {
          const fn = await evalWithCatch(`(x, i) => (${expression})`);
          let i = 0;
          for await (const x of input) {
            if (x instanceof PipelineValue) {
              const result = await fn(await x.value, i);
              if (result instanceof EvalError) {
                return new PipelineError(
                  `basho failed to evaluate expression: ${expression}.`,
                  result.error,
                  x
                );
              }
              if (result === true) {
                return x;
              }
              yield x;
            } else {
              yield x;
            }
            i++;
          }
        }
        return await evalShorthand(
          args.slice(cursor + 1),
          new Seq(asyncGenerator)
        );
      }
    ],

    /* Writing */
    [x => x === "-w", getPrinter(onWrite)(input, args, evalShorthand)],

    /* Everything else as JS expressions */
    [
      x => true,
      async () => {
        const { cursor, expression } = munch(args);
        return await evalShorthand(
          args.slice(cursor),
          await evalExpression(
            toExpressionString(expression),
            input,
            args.slice(cursor),
            isInitialInput
          )
        );
      }
    ]
  ];

  function getPrinter(printFn: BashoLogFn) {
    return (
      input: Seq<PipelineItem>,
      args: Array<string>,
      evalFn: typeof evalShorthand
    ) => async () => {
      const { cursor, expression } = munch(args.slice(1));
      const fn = await evalWithCatch(
        `(x, i) => (${toExpressionString(expression)})`
      );
      const newSeq = input.map(async (x, i) => {
        if (x instanceof PipelineValue) {
          const result = await fn(await x.value, i);
          printFn(
            result instanceof EvalError
              ? new PipelineError(
                  `basho failed to evaluate expression: ${expression}.`,
                  result.error,
                  x
                )
              : result
          );
        }
        return x;
      });
      return await evalShorthand(args.slice(cursor + 1), newSeq);
    };
  }

  async function evalShorthand(
    args: Array<string>,
    input: Seq<PipelineItem>
  ): Promise<BashoEvaluationResult> {
    return await evaluateInternal(args, input, mustPrint, onLog, onWrite);
  }

  return args.length
    ? await (async () => {
        const handler = cases.find(([predicate]) => predicate(args[0]));
        return handler
          ? await handler[1]()
          : exception(`Cannot parse option ${args[0]}.`);
      })()
    : { mustPrint, result: input };
}
