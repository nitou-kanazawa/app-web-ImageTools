import { createContext, useContext, useEffect } from 'react';

/** ステータスバーに表示する1項目。 */
export interface StatusItem {
  /** 項目の識別子（同じ key は上書き）。 */
  key: string;
  text: string;
  /** ホバー時のツールチップ。 */
  title?: string;
}

type StatusSetter = (items: StatusItem[]) => void;

/** AppShell が提供するステータスバー更新関数。 */
export const StatusBarContext = createContext<StatusSetter>(() => {});

/**
 * ツールからステータスバーへ項目を表示する。
 * アンマウント時には自動でクリアされる。
 *
 * 例: useStatusItems(image ? [{ key: 'size', text: `${image.width}×${image.height}px` }] : []);
 */
export function useStatusItems(items: StatusItem[]) {
  const setItems = useContext(StatusBarContext);
  const serialized = JSON.stringify(items);
  useEffect(() => {
    setItems(JSON.parse(serialized) as StatusItem[]);
    return () => setItems([]);
  }, [serialized, setItems]);
}
