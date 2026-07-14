/** ML 系ツール共通の進行状態表示ロジック。 */

/** モデル実行の進行状態。 */
export interface AutoStatus {
  phase: 'idle' | 'loading' | 'running' | 'done' | 'error';
  message: string;
  /** 0-100。ダウンロード中のみ。 */
  progress?: number;
}

/**
 * transformers.js の progress_callback イベントを UI 表示用のステータスへ変換する。
 * 関心のないイベントは null を返す（表示を変えない）。
 */
export function statusFromProgressEvent(ev: {
  status?: string;
  file?: string;
  progress?: number;
}): AutoStatus | null {
  switch (ev.status) {
    case 'initiate':
    case 'download':
      return { phase: 'loading', message: `モデルを取得中... ${ev.file ?? ''}`.trim() };
    case 'progress':
      return {
        phase: 'loading',
        message: `モデルをダウンロード中... ${ev.file ?? ''}`.trim(),
        progress: typeof ev.progress === 'number' ? Math.round(ev.progress) : undefined,
      };
    case 'ready':
      return { phase: 'running', message: '解析中...（初回は数十秒かかることがあります）' };
    default:
      return null;
  }
}
