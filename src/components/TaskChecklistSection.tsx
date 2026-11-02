import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ListTodo,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { TaskChecklistItem } from '../types';

interface TaskChecklistSectionProps {
  taskId: string;
  checklist?: TaskChecklistItem[];
  onChecklistUpdated?: () => void;
}

export function TaskChecklistSection({
  taskId,
  checklist = [],
  onChecklistUpdated,
}: TaskChecklistSectionProps) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');

  const completedCount = checklist.filter((i) => i.is_done).length;
  const totalCount = checklist.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Invalidate task queries to refresh 3-tier progress bar automatically
  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task-checklist', taskId] });
    if (onChecklistUpdated) onChecklistUpdated();
  };

  // Add Item Mutation
  const addItemMutation = useMutation({
    mutationFn: async (title: string) => {
      const res: any = await apiClient.post(`/tasks/${taskId}/checklist`, { title });
      return res.data;
    },
    onSuccess: () => {
      setNewTitle('');
      invalidateQueries();
    },
  });

  // Toggle/Update Item Mutation
  const updateItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      payload,
    }: {
      itemId: string;
      payload: Partial<TaskChecklistItem>;
    }) => {
      const res: any = await apiClient.patch(`/tasks/${taskId}/checklist/${itemId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      setEditingId(null);
      invalidateQueries();
    },
  });

  // Delete Item Mutation
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res: any = await apiClient.delete(`/tasks/${taskId}/checklist/${itemId}`);
      return res.data;
    },
    onSuccess: () => {
      invalidateQueries();
    },
  });

  // Reorder Items Mutation
  const reorderMutation = useMutation({
    mutationFn: async (items: Array<{ id: string; position: number }>) => {
      const res: any = await apiClient.put(`/tasks/${taskId}/checklist/reorder`, { items });
      return res.data;
    },
    onSuccess: () => {
      invalidateQueries();
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addItemMutation.mutate(newTitle.trim());
  };

  const handleToggle = (item: TaskChecklistItem) => {
    updateItemMutation.mutate({
      itemId: item.id,
      payload: { is_done: !item.is_done },
    });
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === checklist.length - 1)
    ) {
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...checklist];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const payload = reordered.map((item, pos) => ({ id: item.id, position: pos + 1 }));
    reorderMutation.mutate(payload);
  };

  return (
    <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
      {/* Header with live percentage indicator */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ListTodo size={18} className="text-indigo-600 shrink-0" />
          <h3 className="text-xs font-bold text-slate-900 tracking-tight">
            Checklist ({completedCount}/{totalCount})
          </h3>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold font-mono text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
              {percentage}% Complete
            </span>
          </div>
        )}
      </div>

      {/* Checklist Progress Bar */}
      {totalCount > 0 && (
        <div className="space-y-1">
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Checklist items list */}
      <div className="space-y-2">
        {checklist.length > 0 ? (
          checklist.map((item, index) => (
            <div
              key={item.id}
              className={`group flex items-center justify-between p-3 rounded-2xl border transition-all ${
                item.is_done
                  ? 'bg-slate-50/80 border-slate-200/80 text-slate-400'
                  : 'bg-white border-slate-200 hover:border-indigo-300 shadow-2xs'
              }`}
            >
              {/* Left check & title */}
              <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
                <button
                  type="button"
                  onClick={() => handleToggle(item)}
                  className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                  title={item.is_done ? 'Mark as incomplete' : 'Mark as completed'}
                >
                  {item.is_done ? (
                    <CheckSquare size={18} className="text-indigo-600 fill-indigo-50" />
                  ) : (
                    <Square size={18} />
                  )}
                </button>

                {editingId === item.id ? (
                  <input
                    type="text"
                    value={editTitleText}
                    onChange={(e) => setEditTitleText(e.target.value)}
                    onBlur={() => {
                      if (editTitleText.trim() && editTitleText !== item.title) {
                        updateItemMutation.mutate({
                          itemId: item.id,
                          payload: { title: editTitleText.trim() },
                        });
                      } else {
                        setEditingId(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editTitleText.trim() && editTitleText !== item.title) {
                          updateItemMutation.mutate({
                            itemId: item.id,
                            payload: { title: editTitleText.trim() },
                          });
                        } else {
                          setEditingId(null);
                        }
                      }
                    }}
                    autoFocus
                    className="flex-1 px-2 py-1 bg-slate-50 border border-indigo-400 rounded-lg text-xs font-medium text-slate-900 focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => {
                      setEditingId(item.id);
                      setEditTitleText(item.title);
                    }}
                    className={`text-xs font-semibold truncate cursor-pointer hover:text-indigo-600 transition-colors ${
                      item.is_done ? 'line-through text-slate-400' : 'text-slate-800'
                    }`}
                  >
                    {item.title}
                  </span>
                )}
              </div>

              {/* Action buttons (Reorder & Delete) */}
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => handleMove(index, 'up')}
                  disabled={index === 0 || reorderMutation.isPending}
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded-md transition-colors"
                  title="Move Up"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 'down')}
                  disabled={index === checklist.length - 1 || reorderMutation.isPending}
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 rounded-md transition-colors"
                  title="Move Down"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteItemMutation.mutate(item.id)}
                  disabled={deleteItemMutation.isPending}
                  className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors ml-1"
                  title="Delete Item"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 text-center space-y-1">
            <CheckCircle2 size={20} className="text-slate-300 mx-auto" />
            <p className="text-xs text-slate-400 font-medium">No checklist items yet.</p>
            <p className="text-[10px] text-slate-400">Add checklist items below to auto-calculate completion progress.</p>
          </div>
        )}
      </div>

      {/* Add new item form */}
      <form onSubmit={handleAddSubmit} className="flex items-center gap-2 pt-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a new checklist item..."
          className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={addItemMutation.isPending || !newTitle.trim()}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs disabled:opacity-40 transition-all flex items-center gap-1 shrink-0"
        >
          <Plus size={14} />
          <span>Add</span>
        </button>
      </form>
    </div>
  );
}
