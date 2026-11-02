import React, { useRef, useState } from 'react';
import { Paperclip, X, File as FileIcon, Image as ImageIcon, FileText } from 'lucide-react';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_FILES } from '../api/attachments';

interface AttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Collects files locally (not yet uploaded) so they can be sent after the task/comment is created.
 */
export function AttachmentPicker({
  files,
  onChange,
  label = 'Attach Documents',
  hint = 'PDF, images, DOCX, XLSX, ZIP — up to 5 files, 10MB each',
  disabled = false,
  compact = false,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${f.name}" is larger than 10MB.`);
        continue;
      }
      if (next.some((existing) => existing.name === f.name && existing.size === f.size)) continue;
      if (next.length >= MAX_ATTACHMENT_FILES) {
        setError(`You can attach up to ${MAX_ATTACHMENT_FILES} files.`);
        break;
      }
      next.push(f);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (idx: number) => {
    setError(null);
    onChange(files.filter((_, i) => i !== idx));
  };

  const iconFor = (f: File) =>
    f.type.startsWith('image/') ? (
      <ImageIcon size={14} className="text-indigo-600" />
    ) : f.type.includes('pdf') ? (
      <FileText size={14} className="text-rose-600" />
    ) : (
      <FileIcon size={14} className="text-slate-500" />
    );

  return (
    <div className="space-y-1.5">
      {!compact && (
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
          <Paperclip size={14} className="text-slate-400" />
          <span>{label}</span>
        </label>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        disabled={disabled}
        onChange={(e) => addFiles(e.target.files)}
        className="hidden"
      />

      {compact ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || files.length >= MAX_ATTACHMENT_FILES}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all shrink-0 disabled:opacity-40"
          title="Attach documents"
        >
          <Paperclip size={15} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || files.length >= MAX_ATTACHMENT_FILES}
          className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-3 text-center bg-slate-50/50 hover:bg-indigo-50/20 transition-all disabled:opacity-50"
        >
          <span className="text-xs font-bold text-slate-700 block">Click to add files</span>
          <span className="text-[10px] text-slate-400">{hint}</span>
        </button>
      )}

      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}

      {files.length > 0 && !compact && (
        <ul className="space-y-1.5">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${f.size}`}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            >
              <span className="flex items-center gap-2 min-w-0">
                {iconFor(f)}
                <span className="font-semibold text-slate-800 truncate">{f.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
              </span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-md shrink-0"
                title="Remove file"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Inline chips for a compact picker (shown above a comment input). */
export function SelectedFileChips({ files, onRemove }: { files: File[]; onRemove: (idx: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, idx) => (
        <span
          key={`${f.name}-${f.size}`}
          className="flex items-center gap-1 pl-2 pr-1 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-lg text-[10px] font-semibold max-w-[200px]"
        >
          <Paperclip size={10} className="shrink-0" />
          <span className="truncate">{f.name}</span>
          <button type="button" onClick={() => onRemove(idx)} className="p-0.5 hover:text-rose-600" title="Remove">
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
