import { useEffect, useRef, useState, type DragEvent } from 'react';

/**
 * 画像ファイルの受け取り口を提供する共有フック。
 * - 領域へのドラッグ&ドロップ（読み込み済みでも即差し替えできる）
 * - クリップボードからの貼り付け（Ctrl+V）
 *
 * 連続で画像を処理する作業を想定し、ファイルダイアログを開かずに
 * 次の画像へ移れるようにする。
 */
export function useImageFileTarget(onFile: (file: File) => void, enabled = true) {
  const [dragActive, setDragActive] = useState(false);
  // 子要素をまたぐ dragenter/leave の対応カウンタ
  const depthRef = useRef(0);
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      e.preventDefault();
      if (!enabledRef.current) return;
      depthRef.current += 1;
      setDragActive(true);
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      e.preventDefault();
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setDragActive(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depthRef.current = 0;
      setDragActive(false);
      if (!enabledRef.current) return;
      const file = e.dataTransfer.files?.[0];
      if (file) onFileRef.current(file);
    },
  };

  // クリップボードの画像を貼り付けで受け取る
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!enabledRef.current) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        onFileRef.current(file);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return { dragActive, dropHandlers };
}
