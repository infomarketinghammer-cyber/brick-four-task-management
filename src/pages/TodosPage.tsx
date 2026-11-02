import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sun,
  Star,
  Calendar,
  ListTodo,
  CheckCircle2,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Check,
  Clock,
  Tag,
  AlertTriangle,
  FileText,
  Link2,
  FolderPlus,
  Palette,
  MoreVertical,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { showToast } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { TodoItem, TodoList, TodoStep } from '../types';

type ActiveView = 'my_day' | 'important' | 'planned' | 'all' | 'completed' | string;

const LIST_COLORS = [
  { name: 'Indigo', value: 'indigo', bg: 'bg-indigo-500', text: 'text-indigo-600', border: 'border-indigo-200', lightBg: 'bg-indigo-50' },
  { name: 'Emerald', value: 'emerald', bg: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200', lightBg: 'bg-emerald-50' },
  { name: 'Blue', value: 'blue', bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200', lightBg: 'bg-blue-50' },
  { name: 'Amber', value: 'amber', bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-200', lightBg: 'bg-amber-50' },
  { name: 'Rose', value: 'rose', bg: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-200', lightBg: 'bg-rose-50' },
  { name: 'Purple', value: 'purple', bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200', lightBg: 'bg-purple-50' },
];

export function TodosPage() {
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const [activeView, setActiveView] = useState<ActiveView>('my_day');
  const [quickTitle, setQuickTitle] = useState('');
  const [selectedTodo, setSelectedTodo] = useState<TodoItem | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCompletedGroup, setShowCompletedGroup] = useState(true);

  // New Custom List State
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('indigo');
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Detail Drawer New Step Input
  const [newStepTitle, setNewStepTitle] = useState('');

  // Fetch Todo Lists
  const { data: todoLists = [] } = useQuery<TodoList[]>({
    queryKey: ['todo-lists'],
    queryFn: async () => {
      const res: any = await apiClient.get('/todo-lists');
      return res.data || [];
    },
  });

  // Fetch Todos for Current User
  const isCustomList = activeView.startsWith('list_');
  const currentListId = isCustomList ? activeView.replace('list_', '') : undefined;
  const viewParam = isCustomList ? 'all' : activeView;

  const { data: todos = [], isLoading: loadingTodos } = useQuery<TodoItem[]>({
    queryKey: ['todos', viewParam, currentListId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (viewParam) params.append('view', viewParam);
      if (currentListId) params.append('list_id', currentListId);
      const res: any = await apiClient.get(`/todos?${params.toString()}`);
      return res.data || [];
    },
  });

  // Fetch All Todos for Suggestions calculation in My Day view
  const { data: allUserTodos = [] } = useQuery<TodoItem[]>({
    queryKey: ['todos', 'all-suggestions'],
    queryFn: async () => {
      const res: any = await apiClient.get('/todos?view=all');
      return res.data || [];
    },
    enabled: activeView === 'my_day',
  });

  // Fetch Assigned Tasks for optional linking
  const { data: assignedTasks = [] } = useQuery<any[]>({
    queryKey: ['assigned-tasks-for-linking'],
    queryFn: async () => {
      const res: any = await apiClient.get('/tasks?view=assigned_to_me');
      return res.data?.tasks || (Array.isArray(res.data) ? res.data : []);
    },
  });

  // Today Date String
  const todayStr = new Date().toISOString().split('T')[0];

  // Suggestions for My Day: Overdue or due today, not yet in My Day, not completed
  const myDaySuggestions = allUserTodos.filter((t) => {
    if (t.is_completed) return false;
    const inMyDayStr = t.added_to_my_day_on ? String(t.added_to_my_day_on).split('T')[0] : null;
    const inMyDay = inMyDayStr === todayStr;
    if (inMyDay) return false;
    if (!t.due_date) return false;
    const dueDateStr = String(t.due_date).split('T')[0];
    return dueDateStr <= todayStr;
  });

  // Active / Uncompleted Todos vs Completed Todos
  const openTodos = todos.filter((t) => !t.is_completed);
  const completedTodos = todos.filter((t) => t.is_completed);

  // --- MUTATIONS WITH OPTIMISTIC UPDATES ---

  // Create Todo Mutation
  const createTodoMutation = useMutation({
    mutationFn: async (payload: Partial<TodoItem>) => {
      const res: any = await apiClient.post('/todos', payload);
      return res.data;
    },
    onSuccess: (newTodo) => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setQuickTitle('');
      showToast({ type: 'success', message: 'To-Do item added' });
    },
    onError: () => {
      showToast({ type: 'error', message: 'Failed to create To-Do' });
    },
  });

  // Toggle Complete Todo Mutation (Optimistic)
  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const res: any = await apiClient.patch(`/todos/${id}/complete`, { is_completed });
      return res.data;
    },
    onMutate: async ({ id, is_completed }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previousTodos = queryClient.getQueryData<TodoItem[]>(['todos', viewParam, currentListId]);

      if (previousTodos) {
        queryClient.setQueryData<TodoItem[]>(['todos', viewParam, currentListId], (old) => {
          return (old || []).map((item) =>
            item.id === id ? { ...item, is_completed, completed_at: is_completed ? new Date().toISOString() : null } : item
          );
        });
      }

      if (selectedTodo?.id === id) {
        setSelectedTodo((prev) => (prev ? { ...prev, is_completed, completed_at: is_completed ? new Date().toISOString() : null } : null));
      }

      return { previousTodos };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos', viewParam, currentListId], context.previousTodos);
      }
      showToast({ type: 'error', message: 'Failed to update item' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  // Toggle Important Mutation (Optimistic)
  const toggleImportantMutation = useMutation({
    mutationFn: async ({ id, is_important }: { id: string; is_important: boolean }) => {
      const res: any = await apiClient.patch(`/todos/${id}`, { is_important });
      return res.data;
    },
    onMutate: async ({ id, is_important }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previousTodos = queryClient.getQueryData<TodoItem[]>(['todos', viewParam, currentListId]);

      if (previousTodos) {
        queryClient.setQueryData<TodoItem[]>(['todos', viewParam, currentListId], (old) => {
          return (old || []).map((item) => (item.id === id ? { ...item, is_important } : item));
        });
      }

      if (selectedTodo?.id === id) {
        setSelectedTodo((prev) => (prev ? { ...prev, is_important } : null));
      }

      return { previousTodos };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(['todos', viewParam, currentListId], context.previousTodos);
      }
      showToast({ type: 'error', message: 'Failed to update importance' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  // Toggle My Day Mutation (Optimistic)
  const toggleMyDayMutation = useMutation({
    mutationFn: async ({ id, in_my_day }: { id: string; in_my_day: boolean }) => {
      const res: any = await apiClient.patch(`/todos/${id}/my-day`, { in_my_day });
      return res.data;
    },
    onMutate: async ({ id, in_my_day }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      if (selectedTodo?.id === id) {
        setSelectedTodo((prev) => (prev ? { ...prev, added_to_my_day_on: in_my_day ? todayStr : null } : null));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      showToast({ type: 'success', message: 'Updated My Day status' });
    },
    onError: () => {
      showToast({ type: 'error', message: 'Failed to update My Day' });
    },
  });

  // Update Todo Fields Mutation
  const updateTodoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TodoItem> }) => {
      const res: any = await apiClient.patch(`/todos/${id}`, data);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      if (selectedTodo?.id === updated.id) {
        setSelectedTodo(updated);
      }
    },
  });

  // Delete Todo Mutation
  const deleteTodoMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await apiClient.delete(`/todos/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setSelectedTodo(null);
      showToast({ type: 'info', message: 'To-Do item deleted' });
    },
  });

  // --- STEPS MUTATIONS ---
  const addStepMutation = useMutation({
    mutationFn: async ({ todoId, title }: { todoId: string; title: string }) => {
      const res: any = await apiClient.post(`/todos/${todoId}/steps`, { title });
      return res.data;
    },
    onSuccess: (newStep) => {
      if (selectedTodo) {
        const currentSteps = selectedTodo.steps || [];
        setSelectedTodo({
          ...selectedTodo,
          steps: [...currentSteps, newStep],
          total_steps_count: (selectedTodo.total_steps_count || 0) + 1,
        });
      }
      setNewStepTitle('');
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: Partial<TodoStep> }) => {
      const res: any = await apiClient.patch(`/todos/steps/${stepId}`, data);
      return res.data;
    },
    onSuccess: (updatedStep) => {
      if (selectedTodo && selectedTodo.steps) {
        const nextSteps = selectedTodo.steps.map((s) => (s.id === updatedStep.id ? updatedStep : s));
        const compCount = nextSteps.filter((s) => s.is_done).length;
        setSelectedTodo({
          ...selectedTodo,
          steps: nextSteps,
          completed_steps_count: compCount,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res: any = await apiClient.delete(`/todos/steps/${stepId}`);
      return res.data;
    },
    onSuccess: (_data, stepId) => {
      if (selectedTodo && selectedTodo.steps) {
        const nextSteps = selectedTodo.steps.filter((s) => s.id !== stepId);
        const compCount = nextSteps.filter((s) => s.is_done).length;
        setSelectedTodo({
          ...selectedTodo,
          steps: nextSteps,
          completed_steps_count: compCount,
          total_steps_count: nextSteps.length,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  // --- LISTS MUTATIONS ---
  const createListMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res: any = await apiClient.post('/todo-lists', { name, color });
      return res.data;
    },
    onSuccess: (newList) => {
      queryClient.invalidateQueries({ queryKey: ['todo-lists'] });
      setNewListName('');
      setIsCreatingList(false);
      setActiveView(`list_${newList.id}`);
      showToast({ type: 'success', message: 'New list created' });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const res: any = await apiClient.delete(`/todo-lists/${listId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todo-lists'] });
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      setActiveView('my_day');
      showToast({ type: 'info', message: 'List deleted' });
    },
  });

  // Quick Add Form Handler
  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    const payload: Partial<TodoItem> = {
      title: quickTitle.trim(),
    };

    if (activeView === 'my_day') {
      payload.added_to_my_day_on = todayStr;
    } else if (activeView === 'important') {
      payload.is_important = true;
    } else if (activeView === 'planned') {
      payload.due_date = `${todayStr}T17:00:00.000Z`;
    } else if (isCustomList) {
      payload.list_id = currentListId;
    }

    createTodoMutation.mutate(payload);
  };

  // Helper for Date display formatted
  const formatDueDateLabel = (dateVal?: string | Date | null) => {
    if (!dateVal) return null;
    const dateStr = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
    const d = new Date(dateStr);
    const dOnly = dateStr.split('T')[0];
    const isToday = dOnly === todayStr;
    const isOverdue = dOnly < todayStr;

    let label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (isToday) label = 'Today';

    let colorStyle = 'text-slate-500 bg-slate-100 border-slate-200';
    if (isOverdue) colorStyle = 'text-rose-700 bg-rose-50 border-rose-200 font-semibold';
    else if (isToday) colorStyle = 'text-blue-700 bg-blue-50 border-blue-200 font-semibold';

    return { label, isOverdue, isToday, colorStyle };
  };

  // View Details (Header) Title and Icon
  const getViewDetails = () => {
    if (activeView === 'my_day') {
      return {
        title: 'My Day',
        subtitle: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        icon: Sun,
        iconColor: 'text-amber-500',
      };
    }
    if (activeView === 'important') {
      return {
        title: 'Important',
        subtitle: 'Starred items needing key focus',
        icon: Star,
        iconColor: 'text-amber-500',
      };
    }
    if (activeView === 'planned') {
      return {
        title: 'Planned',
        subtitle: 'Items with assigned due dates',
        icon: Calendar,
        iconColor: 'text-blue-500',
      };
    }
    if (activeView === 'all') {
      return {
        title: 'All To-Dos',
        subtitle: 'Complete checklist history',
        icon: ListTodo,
        iconColor: 'text-indigo-500',
      };
    }
    if (activeView === 'completed') {
      return {
        title: 'Completed',
        subtitle: 'Finished tasks and accomplishments',
        icon: CheckCircle2,
        iconColor: 'text-emerald-500',
      };
    }
    if (isCustomList) {
      const listObj = todoLists.find((l) => l.id === currentListId);
      return {
        title: listObj ? listObj.name : 'Custom List',
        subtitle: 'Custom organized list',
        icon: Tag,
        iconColor: 'text-indigo-600',
      };
    }
    return { title: 'To-Do', subtitle: '', icon: ListTodo, iconColor: 'text-indigo-600' };
  };

  const currentViewDetails = getViewDetails();
  const HeaderIcon = currentViewDetails.icon;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      {/* ---------------- LEFT SIDEBAR ---------------- */}
      <div className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">My To-Do</h2>
              <p className="text-[10px] text-slate-400 font-medium">Personal Productivity</p>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* My Day */}
          <button
            onClick={() => setActiveView('my_day')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'my_day'
                ? 'bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sun size={16} className={activeView === 'my_day' ? 'text-amber-500' : 'text-slate-400'} />
              <span>My Day</span>
            </div>
          </button>

          {/* Important */}
          <button
            onClick={() => setActiveView('important')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'important'
                ? 'bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Star size={16} className={activeView === 'important' ? 'text-amber-500' : 'text-slate-400'} />
              <span>Important</span>
            </div>
          </button>

          {/* Planned */}
          <button
            onClick={() => setActiveView('planned')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'planned'
                ? 'bg-blue-50 text-blue-900 border border-blue-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Calendar size={16} className={activeView === 'planned' ? 'text-blue-500' : 'text-slate-400'} />
              <span>Planned</span>
            </div>
          </button>

          {/* All */}
          <button
            onClick={() => setActiveView('all')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'all'
                ? 'bg-indigo-50 text-indigo-900 border border-indigo-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ListTodo size={16} className={activeView === 'all' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>All To-Dos</span>
            </div>
          </button>

          {/* Completed */}
          <button
            onClick={() => setActiveView('completed')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'completed'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80 shadow-2xs font-bold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className={activeView === 'completed' ? 'text-emerald-500' : 'text-slate-400'} />
              <span>Completed</span>
            </div>
          </button>

          {/* Custom Lists Header */}
          <div className="pt-4 mt-2 border-t border-slate-100">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Lists
              </span>
              <button
                onClick={() => setIsCreatingList(true)}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-500 hover:text-indigo-600 transition-colors"
                title="Create Custom List"
              >
                <Plus size={14} />
              </button>
            </div>

            {/* Custom Lists Items */}
            <div className="space-y-0.5 mt-1">
              {todoLists.map((list) => {
                const listKey = `list_${list.id}`;
                const isActive = activeView === listKey;
                const colorObj = LIST_COLORS.find((c) => c.value === list.color) || LIST_COLORS[0];

                return (
                  <div
                    key={list.id}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? `${colorObj.lightBg} text-slate-900 border ${colorObj.border} font-bold`
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    onClick={() => setActiveView(listKey)}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className={`w-2.5 h-2.5 rounded-full ${colorObj.bg} shrink-0`} />
                      <span className="truncate">{list.name}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete list "${list.name}"?`)) {
                          deleteListMutation.mutate(list.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200/70 rounded text-slate-400 hover:text-rose-600 transition-all"
                      title="Delete List"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}

              {/* Inline Create List Input */}
              {isCreatingList && (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-2 mt-2">
                  <input
                    type="text"
                    placeholder="List name..."
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    autoFocus
                    className="w-full text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1">
                      {LIST_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setNewListColor(c.value)}
                          className={`w-4 h-4 rounded-full ${c.bg} ${
                            newListColor === c.value ? 'ring-2 ring-slate-800 ring-offset-1' : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setIsCreatingList(false)}
                        className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (newListName.trim()) {
                            createListMutation.mutate({ name: newListName.trim(), color: newListColor });
                          }
                        }}
                        className="px-2 py-1 text-[10px] bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- MAIN CONTENT PANE ---------------- */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
        {/* STANDARD PERSONAL TO-DO VIEW */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="p-6 bg-white border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-2xl bg-slate-100 ${currentViewDetails.iconColor}`}>
                <HeaderIcon size={22} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{currentViewDetails.title}</h1>
                <p className="text-xs text-slate-500 font-medium">{currentViewDetails.subtitle}</p>
              </div>
            </div>

            {/* Suggestions Toggle (For My Day view) */}
            {activeView === 'my_day' && (
              <button
                onClick={() => setShowSuggestions(!showSuggestions)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                  showSuggestions
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Sparkles size={15} className="text-amber-500" />
                <span>Suggestions</span>
                {myDaySuggestions.length > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {myDaySuggestions.length}
                  </span>
                )}
              </button>
            )}
          </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Suggestions Panel */}
              {activeView === 'my_day' && showSuggestions && (
                <div className="p-4 bg-gradient-to-r from-amber-50/80 to-indigo-50/80 border border-amber-200/80 rounded-2xl space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-500" />
                      <span>Suggested To-Dos to Add to My Day</span>
                    </span>
                    <button
                      onClick={() => setShowSuggestions(false)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {myDaySuggestions.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No pending overdue or due-today suggestions!</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {myDaySuggestions.map((s) => {
                        const dueInfo = formatDueDateLabel(s.due_date);
                        return (
                          <div
                            key={s.id}
                            className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs hover:border-amber-300 transition-colors"
                          >
                            <div className="min-w-0 flex-1 pr-3">
                              <p className="font-semibold text-slate-800 truncate">{s.title}</p>
                              {dueInfo && (
                                <span className={`inline-block text-[10px] px-1.5 py-0.2 rounded border mt-0.5 ${dueInfo.colorStyle}`}>
                                  {dueInfo.label}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => toggleMyDayMutation.mutate({ id: s.id, in_my_day: true })}
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold border border-amber-200 rounded-lg transition-colors flex items-center gap-1 text-[11px] shrink-0"
                            >
                              <Plus size={14} />
                              <span>Add</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Pinned Quick-Add Input */}
              <form onSubmit={handleQuickAdd} className="relative">
                <div className="flex items-center gap-3 bg-white border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 rounded-2xl p-2.5 shadow-2xs transition-all">
                  <div className="p-2 text-slate-400">
                    <Plus size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder={`Add a task to "${currentViewDetails.title}"... (Press Enter)`}
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={!quickTitle.trim() || createTodoMutation.isPending}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl transition-colors shadow-2xs"
                  >
                    Add
                  </button>
                </div>
              </form>

              {/* Active / Open Items List */}
              <div className="space-y-2">
                {loadingTodos ? (
                  <div className="p-8 text-center text-xs text-slate-400 font-medium">Loading To-Dos...</div>
                ) : openTodos.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl space-y-2">
                    <CheckCircle2 size={32} className="mx-auto text-slate-300" />
                    <p className="text-xs font-bold text-slate-600">All caught up!</p>
                    <p className="text-[11px] text-slate-400">No open to-dos in this view.</p>
                  </div>
                ) : (
                  openTodos.map((todo) => {
                    const isSelected = selectedTodo?.id === todo.id;
                    const dueInfo = formatDueDateLabel(todo.due_date);

                    return (
                      <div
                        key={todo.id}
                        onClick={() => setSelectedTodo(todo)}
                        className={`group flex items-center justify-between p-3.5 bg-white border rounded-2xl transition-all cursor-pointer shadow-2xs ${
                          isSelected ? 'border-indigo-500 ring-2 ring-indigo-50' : 'border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Round Animated Checkbox */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCompleteMutation.mutate({ id: todo.id, is_completed: true });
                            }}
                            className="w-5 h-5 rounded-full border-2 border-slate-300 hover:border-indigo-600 flex items-center justify-center transition-all group-hover:scale-105 shrink-0"
                            title="Mark as completed"
                          >
                            <Check size={12} className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>

                          {/* Title & Metadata */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-semibold text-slate-900 truncate">{todo.title}</p>
                            <div className="flex flex-wrap items-center gap-2 text-[10px]">
                              {/* Steps count badge */}
                              {todo.total_steps_count !== undefined && todo.total_steps_count > 0 && (
                                <span className="font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                                  {todo.completed_steps_count} of {todo.total_steps_count} steps
                                </span>
                              )}

                              {/* Due Date Chip */}
                              {dueInfo && (
                                <span className={`px-2 py-0.5 rounded-md border text-[10px] ${dueInfo.colorStyle}`}>
                                  {dueInfo.label}
                                </span>
                              )}

                              {/* My Day badge if in another view */}
                              {activeView !== 'my_day' && todo.added_to_my_day_on && (
                                <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-md font-medium flex items-center gap-1">
                                  <Sun size={10} /> My Day
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Star Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleImportantMutation.mutate({ id: todo.id, is_important: !todo.is_important });
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-300 hover:text-amber-500 transition-colors shrink-0"
                          title="Toggle Importance"
                        >
                          <Star
                            size={18}
                            className={todo.is_important ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}
                          />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Completed Group Accordion */}
              {completedTodos.length > 0 && (
                <div className="pt-4 space-y-2">
                  <button
                    onClick={() => setShowCompletedGroup(!showCompletedGroup)}
                    className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors px-1"
                  >
                    {showCompletedGroup ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>Completed ({completedTodos.length})</span>
                  </button>

                  {showCompletedGroup && (
                    <div className="space-y-2 pl-2">
                      {completedTodos.map((todo) => (
                        <div
                          key={todo.id}
                          onClick={() => setSelectedTodo(todo)}
                          className="flex items-center justify-between p-3 bg-slate-100/70 border border-slate-200/60 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCompleteMutation.mutate({ id: todo.id, is_completed: false });
                              }}
                              className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 hover:bg-emerald-600 transition-colors"
                              title="Mark incomplete"
                            >
                              <Check size={12} />
                            </button>
                            <span className="font-medium text-slate-500 line-through truncate">{todo.title}</span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleImportantMutation.mutate({ id: todo.id, is_important: !todo.is_important });
                            }}
                            className="p-1 text-slate-300 hover:text-amber-500"
                          >
                            <Star size={16} className={todo.is_important ? 'text-amber-500 fill-amber-500' : ''} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* ---------------- RIGHT DETAIL DRAWER ---------------- */}
      {selectedTodo && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col">
          {/* Top Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  toggleCompleteMutation.mutate({ id: selectedTodo.id, is_completed: !selectedTodo.is_completed })
                }
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedTodo.is_completed
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 hover:border-indigo-600 text-transparent hover:text-indigo-600'
                }`}
              >
                <Check size={12} />
              </button>
              <span className="text-xs font-bold text-slate-700">To-Do Details</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (confirm('Delete this to-do item?')) {
                    deleteTodoMutation.mutate(selectedTodo.id);
                  }
                }}
                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                title="Delete To-Do"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={() => setSelectedTodo(null)}
                className="p-1.5 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Title Edit */}
            <div>
              <input
                type="text"
                value={selectedTodo.title}
                onChange={(e) => setSelectedTodo({ ...selectedTodo, title: e.target.value })}
                onBlur={() => updateTodoMutation.mutate({ id: selectedTodo.id, data: { title: selectedTodo.title } })}
                className="w-full text-base font-bold text-slate-900 border-b border-slate-200 focus:border-indigo-600 pb-2 focus:outline-hidden"
              />
            </div>

            {/* Steps Checklist */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-indigo-600" />
                <span>Steps ({selectedTodo.completed_steps_count || 0} of {selectedTodo.total_steps_count || 0})</span>
              </span>

              {/* Steps List */}
              <div className="space-y-1.5">
                {(selectedTodo.steps || []).map((step) => (
                  <div key={step.id} className="flex items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200 text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={step.is_done}
                        onChange={(e) => updateStepMutation.mutate({ stepId: step.id, data: { is_done: e.target.checked } })}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className={`truncate ${step.is_done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {step.title}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteStepMutation.mutate(step.id)}
                      className="text-slate-300 hover:text-rose-600 p-1"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Step Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newStepTitle.trim()) {
                    addStepMutation.mutate({ todoId: selectedTodo.id, title: newStepTitle.trim() });
                  }
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="+ Next step..."
                  value={newStepTitle}
                  onChange={(e) => setNewStepTitle(e.target.value)}
                  className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!newStepTitle.trim()}
                  className="px-2.5 py-1.5 bg-indigo-600 disabled:bg-slate-200 text-white font-bold text-xs rounded-xl"
                >
                  Add
                </button>
              </form>
            </div>

            {/* My Day Button */}
            <div>
              {selectedTodo.added_to_my_day_on && selectedTodo.added_to_my_day_on.startsWith(todayStr) ? (
                <button
                  onClick={() => toggleMyDayMutation.mutate({ id: selectedTodo.id, in_my_day: false })}
                  className="w-full p-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-2xl text-xs font-bold flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sun size={16} className="text-amber-500" />
                    <span>Added to My Day</span>
                  </div>
                  <X size={14} className="text-amber-600" />
                </button>
              ) : (
                <button
                  onClick={() => toggleMyDayMutation.mutate({ id: selectedTodo.id, in_my_day: true })}
                  className="w-full p-3 bg-slate-50 hover:bg-amber-50 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-200 rounded-2xl text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <Sun size={16} className="text-slate-400 hover:text-amber-500" />
                  <span>Add to My Day</span>
                </button>
              )}
            </div>

            {/* Due Date Picker */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                <span>Due Date</span>
              </label>
              <input
                type="date"
                value={selectedTodo.due_date ? selectedTodo.due_date.split('T')[0] : ''}
                onChange={(e) => {
                  const val = e.target.value ? `${e.target.value}T18:00:00.000Z` : null;
                  setSelectedTodo({ ...selectedTodo, due_date: val });
                  updateTodoMutation.mutate({ id: selectedTodo.id, data: { due_date: val } });
                }}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              />
            </div>

            {/* Move to List */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <Tag size={14} className="text-slate-400" />
                <span>Custom List</span>
              </label>
              <select
                value={selectedTodo.list_id || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setSelectedTodo({ ...selectedTodo, list_id: val });
                  updateTodoMutation.mutate({ id: selectedTodo.id, data: { list_id: val } });
                }}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              >
                <option value="">(No List)</option>
                {todoLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Link to Task */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <Link2 size={14} className="text-slate-400" />
                <span>Link to Assigned Task</span>
              </label>
              <select
                value={selectedTodo.linked_task_id || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setSelectedTodo({ ...selectedTodo, linked_task_id: val });
                  updateTodoMutation.mutate({ id: selectedTodo.id, data: { linked_task_id: val } });
                }}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              >
                <option value="">(None)</option>
                {assignedTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.id} - {t.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes Area */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <FileText size={14} className="text-slate-400" />
                <span>Notes</span>
              </label>
              <textarea
                rows={4}
                placeholder="Add notes or details..."
                value={selectedTodo.notes || ''}
                onChange={(e) => setSelectedTodo({ ...selectedTodo, notes: e.target.value })}
                onBlur={() => updateTodoMutation.mutate({ id: selectedTodo.id, data: { notes: selectedTodo.notes } })}
                className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 font-medium"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
