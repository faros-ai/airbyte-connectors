import enquirer from 'enquirer';

import {
  BaseConfig,
  ChoiceType,
  PasswordConfig,
  PLACEHOLDER_BOOLEAN,
  PLACEHOLDER_NUMBER,
  PLACEHOLDER_PASSWORD,
  PLACEHOLDER_STRING,
  runBooleanPrompt,
  runNumberPrompt,
  runPassword,
  runSelect,
  runStringPrompt,
  SelectConfig,
  SelectConfigName,
} from '../src/prompts';

describe('runSelect', () => {
  const cfg: SelectConfig = {
    name: SelectConfigName.LEAF,
    message: 'Select an option',
    autofill: true,
    choices: [{type: ChoiceType.SKIP, value: 'Value A', message: 'Skip'}],
  };

  it('should return the autofilled value corresponding to the choice with the lowest order', async () => {
    const result = await runSelect({
      ...cfg,
      choices: [
        {type: ChoiceType.DEFAULT, value: 'Value B', message: 'Default'},
        {type: ChoiceType.EXAMPLE, value: 'Value C', message: 'Example'},
        {type: ChoiceType.SKIP, value: 'Value A', message: 'Skip'},
        {type: ChoiceType.SKIP, value: 'Value A-2', message: 'Skip'},
      ],
    });
    expect(result).toBe('Value A');
  });

  it('should prompt the user when autofill is disabled', async () => {
    cfg.autofill = false;
    (enquirer as any).Select.prototype.run = jest
      .fn()
      .mockResolvedValue('Value B');

    const result = await runSelect(cfg);
    expect(result).toBe('Value B');
    expect((enquirer as any).Select.prototype.run).toHaveBeenCalled();
  });
});

describe('runPassword', () => {
  it('should return the autofilled value when autofill is enabled', async () => {
    const cfg: PasswordConfig = {
      name: 'Enter password',
      message: 'Enter password',
      autofill: true,
    };
    const result = await runPassword(cfg);
    expect(result).toBe(PLACEHOLDER_PASSWORD);
  });

  it('should prompt the user when autofill is disabled', async () => {
    const cfg: PasswordConfig = {
      name: 'Enter password',
      message: 'Enter password',
      autofill: false,
    };
    (enquirer as any).Password.prototype.run = jest
      .fn()
      .mockResolvedValue('password123');

    const result = await runPassword(cfg);
    expect(result).toBe('password123');
    expect((enquirer as any).Password.prototype.run).toHaveBeenCalled();
  });
});

describe('runBooleanPrompt', () => {
  const cfg: BaseConfig = {
    message: 'Enter a boolean',
    autofill: true,
  };

  it('should return the autofilled value when autofill is enabled', async () => {
    const result = await runBooleanPrompt(cfg);
    expect(result).toBe(PLACEHOLDER_BOOLEAN);
  });

  it('should prompt the user when autofill is disabled', async () => {
    cfg.autofill = false;
    (enquirer as any).BooleanPrompt.prototype.run = jest
      .fn()
      .mockResolvedValue(true);

    const result = await runBooleanPrompt(cfg);
    expect(result).toBe(true);
    expect((enquirer as any).BooleanPrompt.prototype.run).toHaveBeenCalled();
  });
});

describe('runNumberPrompt', () => {
  const cfg: BaseConfig = {
    message: 'Enter a number',
    autofill: true,
  };

  it('should return the autofilled value when autofill is enabled', async () => {
    const result = await runNumberPrompt(cfg);
    expect(result).toBe(PLACEHOLDER_NUMBER);
  });

  it('should prompt the user when autofill is disabled', async () => {
    cfg.autofill = false;
    (enquirer as any).NumberPrompt.prototype.run = jest
      .fn()
      .mockResolvedValue(42);

    const result = await runNumberPrompt(cfg);
    expect(result).toBe(42);
    expect((enquirer as any).NumberPrompt.prototype.run).toHaveBeenCalled();
  });
});

describe('runStringPrompt', () => {
  const cfg: BaseConfig = {
    message: 'Enter a string',
    autofill: true,
  };

  it('should return the autofilled value when autofill is enabled', async () => {
    const result = await runStringPrompt(cfg);
    expect(result).toBe(PLACEHOLDER_STRING);
  });

  it('should prompt the user when autofill is disabled', async () => {
    cfg.autofill = false;
    (enquirer as any).StringPrompt.prototype.run = jest
      .fn()
      .mockResolvedValue('testString');

    const result = await runStringPrompt(cfg);
    expect(result).toBe('testString');
    expect((enquirer as any).StringPrompt.prototype.run).toHaveBeenCalled();
  });
});
