import { EvaluationStack, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue, PipelineError } from "../pipeline";
import exception from "../exception";
import { evaluateInternal } from "..";

interface ISubroutine {
  name: string;
  args: string[];
}

export default async function subroutine(
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
) {
  function createSubroutine(
    name: string,
    args: string[]
  ): { subroutine: Function; args: string[] } {
    const sub: ISubroutine = { name, args: [] };

    const { argsInSub, rest } = (function loop(
      remainingArgs: string[],
      argsInSub: string[],
      newFnCount: number
    ): { argsInSub: string[]; rest: string[] } {
      return remainingArgs.length
        ? (() => {
            const [first, ...rest] = remainingArgs;
            return first === "--sub"
              ? loop(rest, argsInSub.concat(first), newFnCount + 1)
              : first === "--endsub"
              ? newFnCount === 0
                ? { argsInSub, rest }
                : loop(rest, argsInSub.concat(first), newFnCount - 1)
              : loop(rest, argsInSub.concat(first), newFnCount);
          })()
        : exception(`Did not find --endsub for subroutine ${name}.`);
    })(args, [], 0);

    async function execSubroutine(x: any) {
      evalScope.create();
      const result = await evaluateInternal(
        argsInSub,
        [],
        evalScope,
        Seq.of([x].map(x => new PipelineValue(x))),
        mustPrint,
        onLog,
        onWrite,
        false,
        true,
        []
      );
      evalScope.unwind();
      const subResult = (await result.result.toArray())[0];
      return subResult instanceof PipelineValue
        ? subResult.value
        : subResult instanceof PipelineError
        ? subResult
        : exception(`Invalid item ${x} in pipeline.`);
    }

    return { subroutine: execSubroutine, args: rest };
  }

  const { subroutine, args: remainingArgs } = createSubroutine(
    args[1],
    args.slice(2)
  );
  const name = args[1];
  evalScope.proxy[name] = subroutine;
  return await evaluateInternal(
    remainingArgs,
    args,
    evalScope,
    input,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
