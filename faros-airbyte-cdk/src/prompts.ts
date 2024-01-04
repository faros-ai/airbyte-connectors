import enquirer from 'enquirer';

export enum ChoiceType {
  SKIP = 'SKIP',
  DEFAULT = 'DEFAULT',
  EXAMPLE = 'EXAMPLE',
  ENVIRONMENT_VARIABLE = 'ENVIRONMENT_VARIABLE',
  BOOLEAN = 'BOOLEAN',
  ENUM = 'ENUM',
  USER_INPUT = 'USER_INPUT',
}

export interface UserChoice {
  message: string;
  value: string | number | boolean;
  type: ChoiceType;
}

export interface SelectConfig {
  name: string;
  message: string;
  choices: ReadonlyArray<ChoiceType>;
}

export function runSelect(cfg: SelectConfig): Promise<string> {
  return new (enquirer as any).Select(cfg).run();
}

export interface PasswordConfig {
  name: string;
  message: string;
}

export function runPassword(cfg: PasswordConfig): Promise<string> {
  return new (enquirer as any).Password(cfg).run();
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
