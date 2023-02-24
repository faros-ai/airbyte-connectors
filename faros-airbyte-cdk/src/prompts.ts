import enquirer from 'enquirer';

export interface SelectConfig {
  name: string;
  message: string;
  choices: ReadonlyArray<any>;
}

export function runSelect(cfg: SelectConfig): Promise<string> {
  return new (enquirer as any).Select(cfg).run();
}

export function runBooleanPrompt(cfg: any): Promise<boolean> {
  return new (enquirer as any).BooleanPrompt(cfg).run();
}

export function runNumberPrompt(cfg: any): Promise<number> {
  return new (enquirer as any).NumberPrompt(cfg).run();
}

export function runStringPrompt(cfg: any): Promise<string> {
  return new (enquirer as any).StringPrompt(cfg).run();
}
