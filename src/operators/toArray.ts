import { Constants, BashoLogFn, ExpressionStackEntry } from "../types";
import { Seq } from "lazily-async";
import { PipelineItem, PipelineValue } from "../pipeline";
import { evalShorthand } from "../eval";

export default async function toArray(
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
    mustPrint,
    onLog,
    onWrite,
    false,
    false,
    expressionStack
  );
}
