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

export type BaseConfig = {
  message: string;
  autofill?: boolean;
};

export enum SelectConfigName {
  ONE_OF = 'oneOf',
  ARRAY = 'array',
  LEAF = 'leaf',
}

export type SelectConfig = BaseConfig & {
  name: SelectConfigName;
  choices: ReadonlyArray<UserChoice>;
};

export const PLACEHOLDER_PASSWORD = '<UPDATE_YOUR_CREDENTIAL>';
export const PLACEHOLDER_STRING = '<UPDATE_THIS_VALUE>';
export const PLACEHOLDER_NUMBER = 0;
export const PLACEHOLDER_BOOLEAN = false;

export function runSelect(cfg: SelectConfig): Promise<string> {
  if (cfg.autofill) {
    // Keep track of the first choice of each type
    const choices: Map<ChoiceType, UserChoice> = new Map();
    cfg.choices.forEach((choice) => {
      if (choices.has(choice.type)) return;
      choices.set(choice.type, choice);
    });
    /**
     * Return the first choice of the lowest order for autofill.
     * Check `ChoiceType` enum: SKIP -> DEFAULT -> EXAMPLE -> ENVIRONMENT_VARIABLE -> BOOLEAN -> ENUM -> USER_INPUT
     *
     * If the config is not requried, SKIP choice is pushed before this function is called and makes the config not filled.
     * If the config falls into the last choice `USER_INPUT`, it will be autofilled with the placeholder value.
     *
     * If the config is a leaf, skip EXAMPLE and ENUM.
     * That means we don't autofill EXAMPLE and ENUM values as that might get confused with DEFAULT values.
     */
    for (const symbol of Object.values(ChoiceType)) {
      if (
        choices.has(symbol) &&
        !(
          cfg.name === SelectConfigName.LEAF &&
          (symbol === ChoiceType.EXAMPLE || symbol === ChoiceType.ENUM)
        )
      ) {
        return Promise.resolve(choices.get(symbol)!.value as string);
      }
    }
  }
  return new (enquirer as any).Select(cfg).run();
}

export type PasswordConfig = BaseConfig & {
  name: string;
};

export function runPassword(cfg: PasswordConfig): Promise<string> {
  if (cfg.autofill) return Promise.resolve(PLACEHOLDER_PASSWORD);
  return new (enquirer as any).Password(cfg).run();
}

export function runBooleanPrompt(cfg: BaseConfig): Promise<boolean> {
  if (cfg.autofill) return Promise.resolve(PLACEHOLDER_BOOLEAN);
  return new (enquirer as any).BooleanPrompt(cfg).run();
}

export function runNumberPrompt(cfg: BaseConfig): Promise<number> {
  if (cfg.autofill) return Promise.resolve(PLACEHOLDER_NUMBER);
  return new (enquirer as any).NumberPrompt(cfg).run();
}

export function runStringPrompt(cfg: BaseConfig): Promise<string> {
  if (cfg.autofill) return Promise.resolve(PLACEHOLDER_STRING);
  return new (enquirer as any).StringPrompt(cfg).run();
}
