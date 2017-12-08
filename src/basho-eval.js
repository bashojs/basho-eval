/* @flow */
import path from "path";
import child_process from "child_process";
import promisify from "nodefunc-promisify";
import { Seq, sequence } from "lazily-async";
import exception from "./exception";
import { log } from "util";

const exec: Promise<() => string> = promisify(child_process.exec);

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

export class PipelineItem {
  previousItem: ?PipelineItem;
  name: ?string;

  constructor(previousItem: ?PipelineItem, name: ?string) {
    this.previousItem = previousItem;
    this.name = name;
  }
}

export class PipelineValue extends PipelineItem {
  value: any;

  constructor(value: any, previousItem?: ?PipelineItem, name?: string) {
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
    previousItem?: ?PipelineItem,
    name?: ?string
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
): Promise<(...args: any) => Promise<EvalError> | Promise<any>> {
  try {
    const fn: Function = await eval(exp);
    return async function(): Promise<any> {
      try {
        return await fn.apply(undefined, arguments);
      } catch (ex) {
        return new EvalError(ex);
      }
    };
  } catch (ex) {
    return async function(): Promise<EvalError> {
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
  _input: string | Seq<PipelineValue | PipelineError>,
  nextArgs: Array<string>
): Promise<Seq<PipelineValue | PipelineError>> {
  return typeof _input === "undefined" || _input === ""
    ? await (async () => {
        const code = `async () => (${exp})`;
        const fn = await evalWithCatch(code);
        const input: EvalError | Array<any> | any = await fn();
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
        const input =
          _input instanceof Seq
            ? _input
            : Array.isArray(_input)
              ? Seq.of(_input.map(i => new PipelineValue(i)))
              : Seq.of([new PipelineValue(_input)]);
        return input.map(async function(
          x: PipelineValue | PipelineError,
          i: number
        ): Promise<PipelineValue | PipelineError> {
          return x instanceof PipelineError
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
              : exception(`Invalid item in sequence`);
        });
      })();
}

async function shellCmd(
  template: string,
  input?: Seq<PipelineValue | PipelineError>,
  nextArgs: Array<string>
): Promise<Seq<PipelineValue | PipelineError>> {
  const fn = await evalWithCatch(`async (x, i) => \`${template}\``);
  return typeof input !== "undefined" && typeof input !== null
    ? input.map(async function(
        x: PipelineValue | PipelineError,
        i: number
      ): Promise<PipelineValue | PipelineError> {
        return x instanceof PipelineError
          ? x
          : await (async () => {
              try {
                const value = await x.value;
                const cmd = await fn(
                  typeof value === "string" ? shellEscape(value) : value,
                  i
                );
                const shellResult = await exec(cmd);
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
            })();
      })
    : await (async () => {
        try {
          const cmd = await fn();
          return cmd instanceof EvalError
            ? Seq.of([
                new PipelineError(
                  `basho failed to evaluate template: ${template}.`,
                  cmd.error
                )
              ])
            : await (async () => {
                const shellResult = await exec(cmd);
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
      })();
}

function evalImport(filename: string, alias: string): void {
  const module =
    filename.startsWith("./") ||
    filename.startsWith("../") ||
    filename.endsWith(".js")
      ? require(path.join(process.cwd(), filename))
      : require(filename);
  global[alias] = module;
}

async function filter(
  exp: string,
  input: Seq<PipelineValue | PipelineError>
): Promise<Seq<PipelineValue | PipelineError>> {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code);
  return input.filter(async function(
    x: PipelineValue | PipelineError,
    i: number
  ): Promise<boolean> {
    return x instanceof PipelineError
      ? true
      : await (async () => {
          const result: EvalError | boolean = await fn(await x.value, i);
          return result instanceof EvalError ? true : result;
        })();
  });
}

async function flatMap(exp, input) {
  const code = `async (x, i) => (${exp})`;
  const fn = await evalWithCatch(code);
  return input.flatMap(async function(
    x: PipelineValue | PipelineError,
    i: number
  ): Promise<AsyncIterable<PipelineValue | PipelineResult>> {
    return x instanceof PipelineError
      ? [x]
      : await (async () => {
          const result = await fn(await x.value, i);
          return result instanceof EvalError
            ? new PipelineError(
                `basho failed to evaluate expression: ${exp}.`,
                result.error,
                x
              )
            : result.map(r => new PipelineValue(r, x));
        })();
  });
}

async function reduce(exp, input, initialValueExp) {
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
          async (acc, x, i) =>
            acc instanceof PipelineError
              ? acc
              : x instanceof PipelineError
                ? x
                : await (async () => {
                    const result = await fn(acc, await x.value, i);
                    return result instanceof EvalError
                      ? new PipelineError(
                          `basho failed to evaluate expression: ${exp}.`,
                          result.error,
                          x
                        )
                      : result;
                  })(),
          initialValue
        );
  return output instanceof PipelineError ? output : new PipelineValue(output);
}

/*
  Consume parameters until we reach an option flag (-p, -e etc)
*/
function munch(
  parts: Array<string>
): { cursor: number, expression: Array<string> | QuotedExpression } {
  function doMunch(parts, expression, cursor) {
    return !parts.length || options.includes(parts[0])
      ? { cursor, expression }
      : doMunch(parts.slice(1), expression.concat(parts[0]), cursor + 1);
  }
  return parts[0] === "-q"
    ? (() => {
        const { cursor, expression } = doMunch(parts.slice(1), [], 1);
        return { cursor, expression: new QuotedExpression(expression) };
      })()
    : doMunch(parts, [], 0);
}

function toExpressionString(args: Array<string> | QuotedExpression) {
  return args instanceof QuotedExpression
    ? `"${args.str.join(" ")}"`
    : args.join(" ");
}

function findNamedValue(name, pipelineItem) {
  return typeof pipelineItem !== "undefined" &&
    pipelineItem.name &&
    pipelineItem.previousItem
    ? pipelineItem.name === name
      ? pipelineItem.value
      : findNamedValue(name, pipelineItem.previousItem)
    : undefined;
}

function getPrinter(printFn) {
  return (input, args, doEval) => async () => {
    const { cursor, expression } = munch(args.slice(1));
    const fn = await evalWithCatch(
      `(x, i) => (${toExpressionString(expression)})`
    );
    const newSeq = input.map(async (x, i) => {
      if (!(x instanceof PipelineError)) {
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
    return await doEval(args.slice(cursor + 1), newSeq);
  };
}

export async function evaluate(
  args: Array<string>,
  input: Seq<PipelineValue | PipelineError>,
  mustPrint: boolean = true,
  onLog: Function,
  onWrite: Function
) {
  const cases: Array<
    [
      (x: string) => boolean,
      () => Promise<{
        mustPrint: boolean,
        result: Seq<PipelineValue | PipelineError>
      }>
    ]
  > = [
    /* Enumerate sequence into an array */
    [
      x => x === "-a",
      async () => {
        const items = await input.toArray();
        const error = items.find(i => i instanceof PipelineError);
        const result = error
          ? Seq.of([error])
          : Seq.of([new PipelineValue(items.map(i => i.value))]);
        return await doEval(args.slice(1), result);
      }
    ],

    /* Combine multiple named streams */
    [
      x => x === "-c",
      async () =>
        await doEval(
          args.slice(2),
          input.map(
            x =>
              new PipelineValue(
                args[1].split(",").map(name => findNamedValue(name, x)),
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
        return await doEval(
          args.slice(cursor + 1),
          await shellCmd(
            toExpressionString(expression),
            input,
            args.slice(cursor + 1)
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
          const fn = await evalWithCatch(
            `async (x, i) => (${toExpressionString(expression)})`
          );
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

        return await doEval(args.slice(cursor + 1), newSeq);
      }
    ],

    /* Filter */
    [
      x => x === "-f",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const filtered = await filter(toExpressionString(expression), input);
        return await doEval(args.slice(cursor + 1), filtered);
      }
    ],

    /* Named Export */
    [
      x => x === "-i",
      async () => {
        evalImport(args[1], args[2]);
        return await doEval(args.slice(3), input);
      }
    ],

    /* JS expressions */
    [
      x => x === "-j",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        return await doEval(
          args.slice(cursor + 1),
          await evalExpression(
            toExpressionString(expression),
            input,
            args.slice(cursor + 1)
          )
        );
      }
    ],

    /* Logging */
    [x => x === "-l", getPrinter(onLog)(input, args, doEval)],

    /* Flatmap */
    [
      x => x === "-m",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        const mapped = await flatMap(toExpressionString(expression), input);
        return await doEval(args.slice(cursor + 1), mapped);
      }
    ],

    /* Named Expressions */
    [
      x => x === "-n",
      async () => {
        const newSeq: Seq<PipelineValue | PipelineError> = input.map(
          async (x, i) => x.clone(args[1])
        );
        return await doEval(args.slice(2), newSeq);
      }
    ],

    /* Error handling. Handled by shell, ignore */
    [
      x => x === "--ignoreerror" || x === "--printerror",
      async () =>
        await evaluate(args.slice(1), input, mustPrint, onLog, onWrite)
    ],

    /* Print */
    [
      x => x === "-p",
      async () => await evaluate(args.slice(1), input, false, onLog, onWrite)
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
              return await doEval(args.slice(cursor + 1), Seq.of([reduced]));
            })()
          : exception(
              `A quoted expression cannot be used in a reduce expression.`
            );
      }
    ],

    /* Terminate the pipeline */
    [
      x => x === "-t",
      async () => {
        const { cursor, expression } = munch(args.slice(1));
        async function* asyncGenerator() {
          const fn = await evalWithCatch(
            `(x, i) => (${toExpressionString(expression)})`
          );
          let i = 0;
          for await (const x of input) {
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
            i++;
          }
        }
        return await doEval(args.slice(cursor + 1), new Seq(asyncGenerator));
      }
    ],

    /* Writing */
    [x => x === "-w", getPrinter(onWrite)(input, args, doEval)],

    [
      /* Everything else as JS expressions */
      x => true,
      async () => {
        const { cursor, expression } = munch(args);
        return await doEval(
          args.slice(cursor),
          await evalExpression(
            toExpressionString(expression),
            input,
            args.slice(cursor)
          )
        );
      }
    ]
  ];

  async function doEval(
    args: Array<string>,
    input: Seq<PipelineValue | PipelineError>
  ): Promise<{
    mustPrint: boolean,
    result: Seq<PipelineValue | PipelineError>
  }> {
    return await evaluate(args, input, mustPrint, onLog, onWrite);
  }

  return args.length
    ? await cases.find(([predicate]) => predicate(args[0]))[1]()
    : { mustPrint, result: input };
}
