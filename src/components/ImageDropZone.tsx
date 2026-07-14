interface ImageDropZoneProps {
  /** 対応する hidden な file input の id。 */
  inputId: string;
  /** 表示する絵文字アイコン。 */
  icon: string;
  onFile: (file: File) => void;
}

/** 画像選択のドロップゾーン（クリックで file input を開く / ドラッグ&ドロップ対応）。 */
export function ImageDropZone({ inputId, icon, onFile }: ImageDropZoneProps) {
  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
    >
      <span className="text-3xl">{icon}</span>
      <span className="text-sm font-medium">クリックして画像を選択（ドラッグ&ドロップも可）</span>
    </label>
  );
}
