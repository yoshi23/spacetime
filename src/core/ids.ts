// Injectable id + clock so core operations stay pure and tests stay deterministic.

export interface IdGen {
  (): string;
}

export interface Clock {
  (): number;
}

let counter = 0;

// Default runtime id generator. Tests pass their own deterministic IdGen.
export const defaultIdGen: IdGen = () => {
  counter += 1;
  return `t_${Date.now().toString(36)}_${counter.toString(36)}`;
};

export const defaultClock: Clock = () => Date.now();
