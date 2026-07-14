import { useCallback, useRef, useState, type RefObject } from 'react';

const UNDO_LIMIT = 30;
// undo スナップショットの合計バイト数上限。巨大画像でタブがメモリ不足にならないようにする。
const UNDO_BYTE_BUDGET = 256 * 1024 * 1024;

/**
 * マスクキャンバスの undo 履歴（ImageData スナップショット）を管理する共有フック。
 * 件数上限に加えて合計バイト数でも制限する。
 */
export function useMaskUndo(maskCanvasRef: RefObject<HTMLCanvasElement | null>) {
  const undoStackRef = useRef<ImageData[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  /** 現在のマスクを undo スタックへ積む。snapshot を渡すと getImageData を省略できる。 */
  const pushUndo = useCallback(
    (snapshot?: ImageData) => {
      const mask = maskCanvasRef.current;
      const ctx = mask?.getContext('2d');
      if (!mask || !ctx) return;
      const stack = undoStackRef.current;
      stack.push(snapshot ?? ctx.getImageData(0, 0, mask.width, mask.height));
      let bytes = stack.reduce((n, d) => n + d.data.byteLength, 0);
      while (stack.length > UNDO_LIMIT || (bytes > UNDO_BYTE_BUDGET && stack.length > 1)) {
        const dropped = stack.shift();
        if (!dropped) break;
        bytes -= dropped.data.byteLength;
      }
      setUndoCount(stack.length);
    },
    [maskCanvasRef],
  );

  /** 直前のスナップショットをマスクへ書き戻し、そのデータを返す（履歴が無ければ null）。 */
  const popUndo = useCallback((): ImageData | null => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    const prev = undoStackRef.current.pop();
    if (!mask || !ctx || !prev) return null;
    ctx.putImageData(prev, 0, 0);
    setUndoCount(undoStackRef.current.length);
    return prev;
  }, [maskCanvasRef]);

  /** 履歴を空にする（画像の読み込み直しなど）。 */
  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    setUndoCount(0);
  }, []);

  return { undoCount, pushUndo, popUndo, resetHistory };
}
