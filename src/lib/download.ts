/** 画像ツール共通のダウンロード/ファイル名ユーティリティ。 */

/** 出力ファイル名を作る（例: photo.jpg → photo_mask.png）。 */
export function exportFileName(originalName: string, suffix: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}_${suffix}.png`;
}

/** キャンバスを PNG としてダウンロードする。 */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // ダウンロード開始前に revoke すると失敗するブラウザがあるため遅延させる
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

/** ImageData を PNG としてダウンロードする。 */
export function downloadImageData(data: ImageData, filename: string) {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')?.putImageData(data, 0, 0);
  downloadCanvasPng(canvas, filename);
}
