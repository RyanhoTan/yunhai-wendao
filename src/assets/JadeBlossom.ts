import { createPlayerCharacter, loadPlayerCharacterAssets } from './PlayerCharacters';

/** Compatibility entry point for the original player integration. */
export const loadJadeBlossomAssets = loadPlayerCharacterAssets;
export const createJadeBlossom = () => createPlayerCharacter('jade-blossom');
