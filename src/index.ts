import path = require("path");
import child_process = require("child_process");
import * as util from "util";
import { Seq, sequence } from "lazily-async";

import exception from "./exception";
import importModule from "./import-module";

const exec = util.promisify(child_process.exec);

// prettier-ignore
/* Options: */
const options = [
  "-a",         //            treat array as a whole
  "-c",         // n1,n2,n3   combine a named stages
  "-d",         //            define an reusable expression
  "-e",         //            shell command
  "-f",         //            filter
  "-g",         // n, exp    recurse
  "--import",   //            import a file or module
  "-j",         //            JS expression
  "-l",         //            evaluate and log a value to console
  "-m",         //            flatMap
  "-n",         //            Named result
  "-q",         //            quote expression as string
  "-p",         //            print
  "-r",         //            reduce
  "-s",         //            seek/recall a named result
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
  exp: string,
  constants: Constants
): Promise<(...args: Array<any>) => any> {
  try {
    const fn = eval(`k => ${exp}`)(constants);
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
  constants: Constants,
  input: Seq<PipelineItem>,
  nextArgs: Array<string>,
  isInitialInput: boolean
): Promise<Seq<PipelineItem>> {
  return isInitialInput
    ? await (async () => {
        const code = `async () => (${exp})`;
        const fn = await evalWithCatch(code, constants);
        const input = await fn();
        return input instanceof EvalError
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
                  const fn = await evalWithCatch(code, constants);
                  const result = await fn(await x.value, i);
                  return result instanceof EvalError
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

async function shellCmd(
  template: string,
  constants: Constants,
  input: Seq<PipelineItem>,
  nextArgs: Array<string>,
  isInitialInput: boolean
): Promise<Seq<PipelineItem>> {
  const fn = await evalWithCatch(`(x, i) => \`${template}\``, constants);
  return isInitialInput
    ? await (async () => {
        try {
          const cmd = await fn();
          return cmd instanceof EvalError
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

async function evalImport(filename: string, alias: string) {
  const isRelative =
    filename.startsWith("./") ||
    filename.startsWith("../") ||
    filename.endsWith(".js");
  const filePath = isRelative ? path.join(process.cwd(), filename) : filename;
  await importModule(filePath, alias, isRelative);
}

async function filter(
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
            return result instanceof EvalError ? true : result;
          })()
        : exception(`Invalid item ${x} in pipeline.`)
  );
}

async function flatMap(
  exp: string,
  constants: Constants,
  input: Seq<PipelineItem>
): Promise<Seq<PipelineItem>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code, constants);
  return input.flatMap(async (x, i) =>
    x instanceof PipelineError
      ? [x]
      : x instanceof PipelineValue
      ? await (async () => {
          const result: Array<any> | EvalError = await fn(await x.value, i);
          return result instanceof EvalError
            ? [
                new PipelineError(
                  `Failed to evaluate expression: ${exp}.`,
                  result.error,
                  x
                ) as PipelineItem
              ]
            : result.map((r: any) => new PipelineValue(r, x));
        })()
      : exception(`Invalid item ${x} in pipeline.`)
  );
}

async function reduce(
  exp: string,
  constants: Constants,
  input: Seq<PipelineItem>,
  initialValueExp: string
): Promise<PipelineItem> {
  const code = `async (acc, x, i) => (${exp})`;
  const fn = await evalWithCatch(code, constants);
  const initialValueCode = `async () => (${initialValueExp})`;
  const getInitialValue = await evalWithCatch(initialValueCode, constants);

  const initialValue = await getInitialValue();
  const output =
    initialValue instanceof EvalError
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
                  return result instanceof EvalError
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

type MunchResult = {
  cursor: number;
  expression: string;
  otherExpressions?: Array<string>;
};

/* Consume parameters until we reach an option flag (-p, -e etc) */
function munch(
  parts: Array<string>,
  numOtherExpressions: number = 0
): MunchResult {
  function doMunch(
    parts: Array<string>,
    args: Array<string>,
    cursor: number
  ): { cursor: number; args: Array<string> } {
    return !parts.length || options.includes(parts[0])
      ? { cursor, args }
      : doMunch(parts.slice(1), args.concat(parts[0]), cursor + 1);
  }

  const isQuoted = parts[0] === "-q";

  const { cursor, args } = doMunch(
    parts.slice(isQuoted ? 1 : 0),
    [],
    isQuoted ? 1 : 0
  );
  const result =
    numOtherExpressions > 0
      ? {
          cursor,
          expression: `${args.slice(0, -numOtherExpressions).join(" ")}`,
          otherExpressions: args.slice(-numOtherExpressions)
        }
      : { cursor, expression: `${args.join(" ")}` };

  return {
    ...result,
    expression: isQuoted ? `"${result.expression}"` : result.expression
  };
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
  pipedValues: Array<string> = [],
  mustPrint: boolean = true,
  onLog: BashoLogFn = () => {},
  onWrite: BashoLogFn = () => {}
) {
  const constants: Constants = {};
  return await evaluateInternal(
    args,
    [],
    constants,
    Seq.of(pipedValues.map(x => new PipelineValue(x))),
    mustPrint,
    onLog,
    onWrite,
    pipedValues.length === 0,
    []
  );
}

type ExpressionStackEntry = {
  name: string;
  args: Array<string>;
};

type Constants = {
  [key: string]: any;
};

async function evaluateInternal(
  args: Array<string>,
  prevArgs: Array<string>,
  constants: Constants,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  expressionStack: Array<ExpressionStackEntry>
): Promise<BashoEvaluationResult> {
  const cases: Array<[(arg: string) => boolean, () => Promise<any>]> = [
    /* Enumerate sequence into an array */
    [
      x => x === "-a",
      async () => {
        const items = await input.toArray();
        return await evalShorthand(
          args.slice(1),
          args,
          constants,
          Seq.of([
            new PipelineValue(
              items.map(x => (x instanceof PipelineValue ? x.value : x))
            )
          ]),
          false
        );
      }
    ],

    /* Combine multiple named streams */
    [
      x => x === "-c",
      async () =>
        await evalShorthand(
          args.slice(2),
          args,
          constants,
          input.map(x => {
            const streams = args[1].split(",");
            return new PipelineValue(
              streams.map(name => {
                const item = findNamedValue(name, x);
                return item instanceof PipelineValue ? item.value : item;
              }),
              x
            );
          }),
          false
        )
    ],

    /* Define a sub-procedure */
    [
      x => x === "-d",
      async () => {
        const { cursor, expression } = munch(args.slice(2));
        constants[args[1]] = eval(expression);
        evalWithCatch(expression, constants);
        return await evalShorthand(
          args.slice(cursor + 2),
          args,
          constants,
          input,
          false
        );
      }
    ],

    /* Execute shell command */
    [
      x => x === "-e",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        return await evalShorthand(
          args.slice(cursor + 1),
          args,
          constants,
          await shellCmd(
            expression,
            constants,
            input,
            args.slice(cursor + 1),
            isInitialInput
          ),
          false
        );
      }
    ],

    /* Error handling */
    [
      x => x === "--error",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const newSeq = input.map(async (x, i) => {
          const fn = await evalWithCatch(
            `async (x, i) => (${expression})`,
            constants
          );
          return x instanceof PipelineError
            ? await (async () => {
                const result = await fn(x, i);
                return result instanceof EvalError
                  ? new PipelineError(
                      `Failed to evaluate error expression: ${expression}.`,
                      result.error,
                      x
                    )
                  : new PipelineValue(result, x);
              })()
            : x;
        });

        return await evalShorthand(
          args.slice(cursor + 1),
          args,
          constants,
          newSeq,
          false
        );
      }
    ],

    /* Filter */
    [
      x => x === "-f",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const filtered = await filter(expression, constants, input);
        return await evalShorthand(
          args.slice(cursor + 1),
          args,
          constants,
          filtered,
          false
        );
      }
    ],

    /* Recurse/Goto */
    [
      x => x === "-g",
      async () => {
        const name = args[1];
        const { cursor, expression } = munch(args.slice(2));
        const recursePoint = expressionStack.find(e => e.name === name);
        const fn = await evalWithCatch(`(x, i) => (${expression})`, constants);
        const newSeq = input.map(async (x, i) =>
          recursePoint
            ? x instanceof PipelineValue
              ? await (async () => {
                  const predicateResult = await fn(await x.value, i);
                  return predicateResult === true
                    ? await (async () => {
                        const recurseArgs = recursePoint.args.slice(
                          0,
                          recursePoint.args.length -
                            (args.length - (cursor + 2))
                        );
                        const innerEvalResult = await evaluateInternal(
                          recurseArgs,
                          [],
                          constants,
                          Seq.of([x]),
                          mustPrint,
                          onLog,
                          onWrite,
                          false,
                          []
                        );
                        const results = await innerEvalResult.result.toArray();
                        const result = results[0];
                        return result instanceof PipelineValue
                          ? new PipelineValue(result.value, x)
                          : result;
                      })()
                    : x;
                })()
              : x
            : new PipelineError(
                `The expression ${name} was not found.`,
                new Error(`Missing expression ${name}.`),
                x
              )
        );
        return await evalShorthand(
          args.slice(cursor + 2),
          args,
          constants,
          newSeq,
          false
        );
      }
    ],

    /* Named Export */
    [
      x => x === "--import",
      async () => {
        await evalImport(args[1], args[2]);
        return await evaluateInternal(
          args.slice(3),
          args,
          constants,
          input,
          mustPrint,
          onLog,
          onWrite,
          isInitialInput,
          expressionStack
        );
      }
    ],

    /* JS expressions */
    [x => x === "-j", getJSExpressionEvaluator(1)],

    /* Logging */
    [x => x === "-l", getPrinter(onLog)(input, args)],

    /* Flatmap */
    [
      x => x === "-m",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const mapped = await flatMap(expression, constants, input);
        return await evalShorthand(
          args.slice(cursor + 1),
          args,
          constants,
          mapped,
          false
        );
      }
    ],

    /* Named Expressions */
    [
      x => x === "-n",
      async () => {
        const newSeq = input.map(async (x, i) => x.clone(args[1]));
        return await evaluateInternal(
          args.slice(2),
          args,
          constants,
          newSeq,
          mustPrint,
          onLog,
          onWrite,
          false,
          expressionStack.concat({ name: args[1], args: prevArgs })
        );
      }
    ],

    /* Error handling. Handled by shell, ignore */
    [
      x => x === "--ignoreerror" || x === "--printerror",
      async () =>
        await evaluateInternal(
          args.slice(1),
          args,
          constants,
          input,
          mustPrint,
          onLog,
          onWrite,
          isInitialInput,
          expressionStack
        )
    ],

    /* Print */
    [
      x => x === "-p",
      async () =>
        await evaluateInternal(
          args.slice(1),
          args,
          constants,
          input,
          false,
          onLog,
          onWrite,
          isInitialInput,
          expressionStack
        )
    ],

    /* Reduce */
    [
      x => x === "-r",
      async () => {
        const { cursor, expression, otherExpressions } = munch(
          args.slice(1),
          1
        );
        return typeof otherExpressions !== "undefined"
          ? await (async () => {
              const initialValue = otherExpressions[0];
              return await (async () => {
                const reduced = await reduce(
                  expression,
                  constants,
                  input,
                  initialValue
                );
                return await evalShorthand(
                  args.slice(cursor + 1),
                  args,
                  constants,
                  Seq.of([reduced]),
                  false
                );
              })();
            })()
          : exception(`Failed to evaluate initial value expression.`);
      }
    ],

    /* Seek a named result */
    [
      x => x === "-s",
      async () =>
        await evalShorthand(
          args.slice(2),
          args,
          constants,
          input.map(x => {
            return new PipelineValue(
              (() => {
                const item = findNamedValue(args[1], x);
                return item instanceof PipelineValue ? item.value : item;
              })(),
              x
            );
          }),
          false
        )
    ],

    /* Terminate the pipeline */
    [
      x => x === "-t",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        async function* asyncGenerator(): AsyncIterableIterator<PipelineItem> {
          const fn = await evalWithCatch(
            `(x, i) => (${expression})`,
            constants
          );
          let i = 0;
          for await (const x of input) {
            if (x instanceof PipelineValue) {
              const result = await fn(await x.value, i);
              if (result instanceof EvalError) {
                return new PipelineError(
                  `Failed to evaluate expression: ${expression}.`,
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
          args,
          constants,
          new Seq(asyncGenerator),
          false
        );
      }
    ],

    /* Recall and use the expression */
    [
      x => x === "-u",
      async function() {
        const { cursor, expression } = munch(args.slice(1));
        const expandedExpression = eval(`k => \`${expression}\``)(constants);
        return await evalShorthand(
          args.slice(cursor + 1),
          args,
          constants,
          await evalExpression(
            expandedExpression,
            constants,
            input,
            args.slice(cursor + 1),
            isInitialInput
          ),
          false
        );
      }
    ],

    /* Writing */
    [x => x === "-w", getPrinter(onWrite)(input, args)],

    /* Everything else as JS expressions */
    [x => true, getJSExpressionEvaluator(0)]
  ];

  function getJSExpressionEvaluator(expressionStartIndex: number) {
    return async () => {
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
        false
      );
    };
  }

  function getPrinter(printFn: BashoLogFn) {
    return (input: Seq<PipelineItem>, args: Array<string>) => async () => {
      const { cursor, expression } = munch(args.slice(1));
      const fn = await evalWithCatch(`(x, i) => (${expression})`, constants);
      const newSeq = input.map(async (x, i) => {
        if (x instanceof PipelineValue) {
          const result = await fn(await x.value, i);
          printFn(
            result instanceof EvalError
              ? `Failed to evaluate expression: ${expression}.`
              : result
          );
        }
        return x;
      });
      return await evalShorthand(
        args.slice(cursor + 1),
        args,
        constants,
        newSeq,
        isInitialInput
      );
    };
  }

  async function evalShorthand(
    args: Array<string>,
    prevArgs: Array<string>,
    constants: Constants,
    input: Seq<PipelineItem>,
    isInitialInput: boolean
  ): Promise<BashoEvaluationResult> {
    return await evaluateInternal(
      args,
      prevArgs,
      constants,
      input,
      mustPrint,
      onLog,
      onWrite,
      isInitialInput,
      expressionStack
    );
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
