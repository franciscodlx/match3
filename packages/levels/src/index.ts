import raw from './levels.json';
import { validateLevels } from './validate.ts';

export { validateLevels } from './validate.ts';
export { playBot, type BotResult } from './bot.ts';

/** Launch levels, validated at load so a bad edit fails loudly instead of mid-game. */
export const LEVELS = validateLevels(raw);
