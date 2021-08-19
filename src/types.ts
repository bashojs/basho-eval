import { PipelineItem } from "./pipeline.js";
import { Seq } from "lazily-async";

export type ExpressionStackEntry = {
  name: string;
  args: string[];
};

export type EvaluationEnv = {
  [key: string]: any;
};

export type EvaluationStack = {
  create: () => void;
  unwind: () => void;
  value: EvaluationEnv[];
  proxy: EvaluationEnv;
};

export type BashoLogFn = (msg: string) => void;

export type BashoEvaluationResult = {
  mustPrint: boolean;
  result: Seq<PipelineItem>;
};
