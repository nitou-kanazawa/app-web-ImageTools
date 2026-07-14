export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
}

/**
 * テキストの基本的な統計を計算する。
 * UI から切り離してあるので、ユニットテストしやすい。
 */
export function countText(text: string): TextStats {
  const characters = [...text].length;
  const charactersNoSpaces = [...text.replace(/\s/g, '')].length;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const lines = text === '' ? 0 : text.split(/\r\n|\r|\n/).length;
  return { characters, charactersNoSpaces, words, lines };
}
