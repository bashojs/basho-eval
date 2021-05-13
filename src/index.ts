import { Seq } from "lazily-async";
import exception from "./exception";
import {
  EvaluationStack,
  BashoLogFn,
  ExpressionStackEntry,
  BashoEvaluationResult,
  EvaluationEnv
} from "./types";
import { PipelineValue, PipelineItem } from "./pipeline";
import jsExpression from "./operators/jsExpression";
import errorHandler from "./operators/errorHandler";
import toArray from "./operators/toArray";
import combineStreams from "./operators/combineStreams";
import defineExpression from "./operators/defineExpression";
import execShellCommand from "./operators/execShellCommand";
import onError from "./operators/onError";
import filter from "./operators/filter";
import recurse from "./operators/recurse";
import doImport from "./operators/doImport";
import log from "./operators/log";
import flatMap from "./operators/flatMap";
import namedExpression from "./operators/namedExpression";
import print from "./operators/print";
import reduce from "./operators/reduce";
import seek from "./operators/seek";
import subroutine from "./operators/subroutine";
import terminate from "./operators/terminate";
import write from "./operators/write";
import asString from "./operators/asString";
import asJson from "./operators/asJson";

export { PipelineValue, PipelineError } from "./pipeline";

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

function createProxy(): EvaluationStack {
  const evalScope: EvaluationEnv[] = [{}];

  const handler = {
    get: (evalScope: EvaluationEnv[], prop: string) => {
      const item = (function loop(evalScope: EvaluationEnv[]): any {
        const last = evalScope.slice(-1)[0];
        return last && last[prop]
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
    }
  };

  const proxy = new Proxy(evalScope, handler);

  return {
    create: () => evalScope.push({}),
    unwind: () => evalScope.pop(),
    value: evalScope,
    proxy
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
    Seq.of(pipedValues.map(x => new PipelineValue(x))),
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
    [x => x === "-a", toArray],

    /* Combine multiple named streams */
    [x => x === "-c", combineStreams],

    /* Define an expression */
    [x => x === "-d", defineExpression],

    /* Execute shell command */
    [x => x === "-e", execShellCommand],

    /* Error handling */
    [x => x === "--error", onError],

    /* Filter */
    [x => x === "-f", filter],

    /* Recurse/Goto */
    [x => x === "-g", recurse],

    /* Named Export */
    [x => x === "--import" || x === "-i", doImport],

    /* JS expressions */
    [x => x === "-j", jsExpression(1)],

    /* Treats input as JSON */
    [x => x === "--json", asJson],

    /* Logging */
    [x => x === "-l", log],

    /* Flatmap */
    [x => x === "-m", flatMap],

    /* Named Expressions */
    [x => x === "-n", namedExpression],

    /* Error handling. Handled by shell, ignore */
    [x => x === "--ignoreerror" || x === "--printerror", errorHandler],

    /* Print */
    [x => x === "-p", print],

    /* Reduce */
    [x => x === "-r", reduce],

    /* Seek a named result */
    [x => x === "-s", seek],

    /* Convert input to a single string */
    [x => x === "--str", asString],

    /* Define a subroutine */
    [x => x === "--sub", subroutine],

    /* Terminate the pipeline */
    [x => x === "-t", terminate],

    /* Writing */
    [x => x === "-w", write],

    /* Everything else as a JS expression */
    [x => isFirstParam, jsExpression(0)]
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
