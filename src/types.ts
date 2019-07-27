import { PipelineItem } from "./pipeline";
import { Seq } from "lazily-async";

export type ExpressionStackEntry = {
  name: string;
  args: string[];
};

// export type Constants = {
//   [key: string]: any;
// }[];

export type Constants = {
  [key: string]: any;
};

export type BashoLogFn = (msg: string) => void;

export type BashoEvaluationResult = {
  mustPrint: boolean;
  result: Seq<PipelineItem>;
};
