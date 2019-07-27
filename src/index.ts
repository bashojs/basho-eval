import { Seq } from "lazily-async";
import exception from "./exception";
import {
  Constants,
  BashoLogFn,
  ExpressionStackEntry,
  BashoEvaluationResult
} from "./types";
import { PipelineValue, PipelineItem } from "./pipeline";
import jsExpression from "./operators/jsExpression";
import errorHandler from "./operators/errorHandler";
import toArray from "./operators/toArray";
import combineStreams from "./operators/combineStreams";
import defineExpression from "./operators/defineExpression";
import executeShellCommand from "./operators/executeShellCommand";
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

export async function evaluate(
  args: string[],
  pipedValues: string[] = [],
  constants: Constants = {},
  mustPrint: boolean = true,
  onLog: BashoLogFn = () => {},
  onWrite: BashoLogFn = () => {}
) {
  return await evaluateInternal(
    args,
    [],
    constants,
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
  constants: Constants,
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
  constants: Constants,
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
    [x => x === "-e", executeShellCommand],

    /* Error handling */
    [x => x === "--error", onError],

    /* Filter */
    [x => x === "-f", filter],

    /* Recurse/Goto */
    [x => x === "-g", recurse],

    /* Named Export */
    [x => x === "--import", doImport],

    /* JS expressions */
    [x => x === "-j", jsExpression(1)],

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

    /* Define a subroutine */
    [x => x === "--sub", subroutine],

    /* Terminate the pipeline */
    [x => x === "-t", terminate],

    /* Writing */
    [x => x === "-w", write],

    /* Everything else as JS expressions */
    [x => isFirstParam, jsExpression(0)]
  ];

  return args.length
    ? await (async () => {
        const handler = cases.find(([predicate]) => predicate(args[0]));
        return handler
          ? await handler[1](
              args,
              prevArgs,
              constants,
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
