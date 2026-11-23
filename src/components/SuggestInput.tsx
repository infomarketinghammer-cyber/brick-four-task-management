import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SuggestInputProps {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// A free-text field that also offers existing values (departments, designations, ...) as a
// dropdown of suggestions — type to filter, click one to select, or just type something new.
export function SuggestInput({ suggestions, value, onChange, placeholder, className }: SuggestInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Opening with something already selected shouldn't instantly filter the list down to a
  // single near-match — show every suggestion first, and only filter once the person
  // actually starts editing the text.
  const [hasEdited, setHasEdited] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHasEdited(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const uniqueSuggestions = Array.from(new Set(suggestions.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  const filtered = hasEdited
    ? uniqueSuggestions.filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()))
    : uniqueSuggestions;
  // Offer "create new" whenever what's typed doesn't exactly match an existing option.
  const showCreateOption =
    hasEdited &&
    value.trim().length > 0 &&
    !uniqueSuggestions.some((s) => s.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus-within:bg-white focus-within:border-indigo-500 cursor-text"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setHasEdited(true);
            setIsOpen(true);
          }}
          onFocus={(e) => {
            setIsOpen(true);
            setHasEdited(false);
            // Select the existing text so the next keystroke naturally replaces it,
            // without visibly clearing the field first.
            requestAnimationFrame(() => e.target.select());
          }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 bg-transparent text-slate-900 font-semibold focus:outline-none ${className || ''}`}
        />
        <ChevronDown size={13} className="text-slate-400 shrink-0" />
      </div>

      {isOpen && (filtered.length > 0 || showCreateOption) && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onChange(s);
                setIsOpen(false);
                setHasEdited(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 ${
                s === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-800'
              }`}
            >
              {s}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setHasEdited(false);
              }}
              className="w-full text-left px-3 py-2 text-xs text-indigo-600 font-semibold hover:bg-indigo-50 border-t border-slate-100"
            >
              Use "{value.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
