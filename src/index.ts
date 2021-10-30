import { Seq } from "lazily-async";
import exception from "./exception.js";
import {
  EvaluationStack,
  BashoLogFn,
  ExpressionStackEntry,
  BashoEvaluationResult,
  EvaluationEnv,
} from "./types.js";
import { PipelineValue, PipelineItem } from "./pipeline.js";
import jsExpression from "./operators/jsExpression.js";
import errorHandler from "./operators/errorHandler.js";
import toArray from "./operators/toArray.js";
import combineStreams from "./operators/combineStreams.js";
import defineExpression from "./operators/defineExpression.js";
import execShellCommand from "./operators/execShellCommand.js";
import onError from "./operators/onError.js";
import filter from "./operators/filter.js";
import recurse from "./operators/recurse.js";
import { defaultImport, namedImport } from "./operators/doImport.js";
import log from "./operators/log.js";
import flatMap from "./operators/flatMap.js";
import namedExpression from "./operators/namedExpression.js";
import print from "./operators/print.js";
import reduce from "./operators/reduce.js";
import seek from "./operators/seek.js";
import subroutine from "./operators/subroutine.js";
import terminate from "./operators/terminate.js";
import write from "./operators/write.js";
import asString from "./operators/asString.js";
import asJson from "./operators/asJson.js";
import asYaml from "./operators/asYaml.js";
import asToml from "./operators/asToml.js";
import yaml from "js-yaml";
import toml from "toml";

// Node fetch is not ESM.
const nodeFetch = (await import("node-fetch" as any)).default;

export { PipelineValue, PipelineError } from "./pipeline.js";

export class QuotedExpression {
  str: string[];

  constructor(str: string[]) {
    this.str = str;
  }
}

export class BashoEvalError {
  error: any;

  constructor(error: any) {
    this.error = error;
  }
}

const builtIns = {
  lib: {
    yaml: (str: string) => yaml.load(str),
    toYaml: (obj: any, options = {}) => yaml.dump(obj, options),
    toml: (str: string) => toml.parse(str),
    fetch: nodeFetch,
  },
};

function createProxy(): EvaluationStack {
  const evalScope: EvaluationEnv[] = [builtIns];

  const handler = {
    get: (evalScope: EvaluationEnv[], prop: string) => {
      const item = (function loop(evalScope: EvaluationEnv[]): any {
        const last = evalScope.slice(-1)[0];
        return last && last[prop] !== undefined
          ? last[prop]
          : evalScope.length > 1
          ? loop(evalScope.slice(0, -1))
          : undefined;
      })(evalScope);
      return item;
    },
    set: (evalScope: EvaluationEnv[], prop: string, value: any) => {
      const outer = evalScope.slice(-1)[0];
      outer[prop] = value;
      return true;
    },
  };

  const proxy = new Proxy(evalScope, handler);

  return {
    create: () => evalScope.push({}),
    unwind: () => evalScope.pop(),
    value: evalScope,
    proxy,
  };
}

export async function evaluate(
  args: string[],
  pipedValues: string[] = [],
  mustPrint: boolean = true,
  onLog: BashoLogFn = () => {},
  onWrite: BashoLogFn = () => {}
) {
  return await createStackAndEvaluate(
    args,
    pipedValues,
    mustPrint,
    onLog,
    onWrite
  );
}

export async function createStackAndEvaluate(
  args: string[],
  pipedValues: string[] = [],
  mustPrint: boolean = true,
  onLog: BashoLogFn = () => {},
  onWrite: BashoLogFn = () => {}
) {
  const evalScope = createProxy();
  return await evaluateInternal(
    args,
    [],
    evalScope,
    Seq.of(pipedValues.map((x) => new PipelineValue(x))),
    mustPrint,
    onLog,
    onWrite,
    pipedValues.length === 0,
    true,
    []
  );
}

type OperatorFn = (
  args: string[],
  prevArgs: string[],
  evalScope: EvaluationStack,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  isFirstParam: boolean,
  expressionStack: Array<ExpressionStackEntry>
) => Promise<any>;

export async function evaluateInternal(
  args: string[],
  prevArgs: string[],
  evalScope: EvaluationStack,
  input: Seq<PipelineItem>,
  mustPrint: boolean,
  onLog: BashoLogFn,
  onWrite: BashoLogFn,
  isInitialInput: boolean,
  isFirstParam: boolean,
  expressionStack: Array<ExpressionStackEntry>
): Promise<BashoEvaluationResult> {
  const cases: Array<[(arg: string) => boolean, OperatorFn]> = [
    /* Enumerate sequence into an array */
    [(x) => x === "-a", toArray],

    /* Combine multiple named streams */
    [(x) => x === "-c", combineStreams],

    /* Define an expression */
    [(x) => x === "-d", defineExpression],

    /* Execute shell command */
    [(x) => x === "-e", execShellCommand],

    /* Error handling */
    [(x) => x === "--error", onError],

    /* Filter */
    [(x) => x === "-f", filter],

    /* Recurse/Goto */
    [(x) => x === "-g", recurse],

    /* Import default export from a module */
    [(x) => x === "--import" || x === "-i", defaultImport()],

    /* Import named export from a module */
    [(x) => x === "--named-import", namedImport()],

    /* JS expressions */
    [(x) => x === "-j", jsExpression(1)],

    /* Treats input as JSON */
    [(x) => x === "--json", asJson],

    /* Treats input as YAML */
    [(x) => x === "--yaml", asYaml],

    /* Treats input as TOML */
    [(x) => x === "--toml", asToml],

    /* Logging */
    [(x) => x === "-l", log],

    /* Flatmap */
    [(x) => x === "-m", flatMap],

    /* Named Expressions */
    [(x) => x === "-n", namedExpression],

    /* Error handling. Handled by shell, ignore */
    [(x) => x === "--ignoreerror" || x === "--printerror", errorHandler],

    /* Print */
    [(x) => x === "-p", print],

    /* Reduce */
    [(x) => x === "-r", reduce],

    /* Seek a named result */
    [(x) => x === "-s", seek],

    /* Convert input to a single string */
    [(x) => x === "--str", asString],

    /* Define a subroutine */
    [(x) => x === "--sub", subroutine],

    /* Terminate the pipeline */
    [(x) => x === "-t", terminate],

    /* Writing */
    [(x) => x === "-w", write],

    /* Everything else as a JS expression */
    [(x) => isFirstParam, jsExpression(0)],
  ];

  return args.length
    ? await (async () => {
        const handler = cases.find(([predicate]) => predicate(args[0]));
        return handler
          ? await handler[1](
              args,
              prevArgs,
              evalScope,
              input,
              mustPrint,
              onLog,
              onWrite,
              isInitialInput,
              isFirstParam,
              expressionStack
            )
          : exception(`Cannot parse option ${args[0]}.`);
      })()
    : { mustPrint, result: input };
}
