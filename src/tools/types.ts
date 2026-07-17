import type { ComponentType } from 'react';

/**
 * 各ツールが公開するメタ情報。
 * `src/tools/<name>/tool.tsx` で `meta` という名前で export する。
 */
export interface ToolMeta {
  /** URL スラッグ。フォルダ名と一致させること（例: "word-counter"）。 */
  slug: string;
  /** 一覧やページ見出しに表示する名前。 */
  title: string;
  /** ツールの説明（1〜2文）。一覧カードに表示される。 */
  description: string;
  /** 任意。一覧での絞り込み・分類用。 */
  tags?: string[];
  /**
   * 任意。サイドバーや一覧に表示するアイコン名（例: "scissors"）。
   * 使用可能な名前は src/components/icons.tsx を参照。絵文字は使わない。
   */
  icon?: string;
}

/** レジストリに登録されるツール1件。 */
export interface RegisteredTool {
  meta: ToolMeta;
  Component: ComponentType;
}
