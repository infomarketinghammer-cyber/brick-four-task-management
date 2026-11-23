import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface ComboboxOption {
  id: string;
  name: string;
  designation?: string;
  role?: string;
}

interface EmployeeComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  noneLabel?: string;
  disabled?: boolean;
}

// A searchable, type-to-filter employee picker — a plain <select> gets unusable once a
// department/org has more than a handful of names in it.
export function EmployeeCombobox({
  options,
  value,
  onChange,
  placeholder = 'Search employee name...',
  noneLabel = '-- None --',
  disabled,
}: EmployeeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Opening with something already selected shouldn't blank the field and dump a filtered
  // sliver of the list — it should show the full list with the current pick highlighted,
  // ready to type over. Only start filtering once the person actually edits the text.
  const [hasEdited, setHasEdited] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);
  const selectedLabel = selected ? `${selected.name}${selected.designation ? ` (${selected.designation})` : ''}` : '';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHasEdited(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
    setHasEdited(false);
    setQuery(selectedLabel);
    // Select the existing text so the next keystroke naturally replaces it, without
    // visibly clearing the field first.
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const filtered = options.filter((o) => {
    if (!hasEdited) return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      o.name.toLowerCase().includes(q) ||
      o.designation?.toLowerCase().includes(q) ||
      o.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => {
          if (!isOpen) inputRef.current?.focus();
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus-within:bg-white focus-within:border-indigo-500 cursor-text ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <Search size={13} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={isOpen ? query : selectedLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            setHasEdited(true);
            setIsOpen(true);
          }}
          onFocus={openDropdown}
          placeholder={selected ? undefined : placeholder}
          className="flex-1 min-w-0 bg-transparent text-slate-900 font-semibold focus:outline-none"
        />
        {selected && !isOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="text-slate-400 hover:text-slate-600 shrink-0"
            title="Clear selection"
          >
            <X size={13} />
          </button>
        )}
        <ChevronDown size={13} className="text-slate-400 shrink-0" />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
              setHasEdited(false);
              setQuery('');
            }}
            className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:bg-slate-50"
          >
            {noneLabel}
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No matching employees.</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setIsOpen(false);
                  setHasEdited(false);
                  setQuery('');
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 ${
                  o.id === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-800'
                }`}
              >
                {o.name}
                {o.designation && <span className="text-slate-400"> ({o.designation}{o.role ? ` - ${o.role}` : ''})</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
