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

export function findNamedValue(
  name: string,
  pipelineItem?: PipelineItem
): PipelineItem | undefined {
  return typeof pipelineItem !== "undefined"
    ? pipelineItem.name === name
      ? pipelineItem
      : findNamedValue(name, pipelineItem.previousItem)
    : undefined;
}
