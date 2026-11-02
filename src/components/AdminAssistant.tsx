import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Sparkles, RotateCcw } from 'lucide-react';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Which tasks are overdue right now?',
  'Who has the most open tasks?',
  'Summarise what the Legal team is working on.',
  'List critical tasks due this week.',
];

/**
 * Floating AI assistant, rendered only for ADMIN users (the API is ADMIN-gated as well).
 */
export function AdminAssistant() {
  const user = useAuthStore((state) => state.user);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  if (user?.role !== 'ADMIN') return null;

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsSending(true);

    try {
      const res: any = await apiClient.post('/assistant/chat', { messages: nextMessages });
      const reply = res?.data?.reply || 'No answer was returned.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message || err.message
        : 'The assistant could not answer right now.';
      setError(msg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed z-40 right-4 bottom-20 md:bottom-6 w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-all"
          title="Admin AI Assistant"
          aria-label="Open admin AI assistant"
        >
          <Bot size={22} />
        </button>
      )}

      {isOpen && (
        <div className="fixed z-50 right-2 left-2 sm:left-auto sm:right-4 bottom-20 md:bottom-6 sm:w-[380px] h-[min(560px,calc(100vh-7rem))] bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/70 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-600 text-white">
                <Sparkles size={16} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Admin Assistant</h3>
                <p className="text-[10px] text-slate-500">Ask about tasks, workload & people</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  title="New chat"
                >
                  <RotateCcw size={15} />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  I can answer questions using live task and team data. Try one of these:
                </p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left px-3 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-medium text-slate-700 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-tl-none text-xs text-slate-400">
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <p className="text-[11px] font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-200">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the assistant…"
              className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-40 shrink-0"
              title="Send"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
