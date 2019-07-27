import { Constants, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem } from "../pipeline";
import { evalShorthand } from "../eval";
import exception from "../exception";

interface ISubroutine {
  name: string;
  args: string[];
}

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

  function executeSubroutine() {
    // evaluateInternal()
  }

  return { subroutine: executeSubroutine, args: rest };
}

export default async function(
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
) {
  const { subroutine, args: remainingArgs } = createSubroutine(
    args[1],
    args.slice(2)
  );
  const inScopeConstants = constants.slice(-1)[0];
  inScopeConstants[args[1]] = subroutine;
  return await evalShorthand(
    remainingArgs,
    args,
    constants,
    input,
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
