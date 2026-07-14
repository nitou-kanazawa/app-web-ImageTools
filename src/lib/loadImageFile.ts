/** 画像ファイルを HTMLImageElement として読み込む（画像以外は無視）。 */
export function loadImageFile(file: File, onLoad: (img: HTMLImageElement) => void): void {
  if (!file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    onLoad(img);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
