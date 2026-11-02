import { TodoItem, TodoList, TodoStep, TodoSummary } from '../types';
import { dbStore } from './prisma';
import {
  persistTodo,
  persistDeleteTodo,
  persistTodoList,
  persistDeleteTodoList,
  persistTodoStep,
  persistDeleteTodoStep,
} from './mongodb';

const getTodayDateStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

class TodosStore {
  public todos: Map<string, TodoItem> = new Map();
  public todoLists: Map<string, TodoList> = new Map();
  public todoSteps: Map<string, TodoStep> = new Map();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    this.todos.clear();
    this.todoSteps.clear();
    this.todoLists.clear();
  }

  // Populate steps & counts for a todo
  public formatTodoWithSteps(todo: TodoItem): TodoItem {
    const steps = Array.from(this.todoSteps.values())
      .filter((s) => s.todo_id === todo.id)
      .sort((a, b) => a.position - b.position);

    const completed_steps_count = steps.filter((s) => s.is_done).length;
    const total_steps_count = steps.length;

    return {
      ...todo,
      steps,
      completed_steps_count,
      total_steps_count,
    };
  }

  // Get todos with view and list filtering
  public getTodos(ownerId: string, view?: string, listId?: string): TodoItem[] {
    const today = getTodayDateStr();
    let items = Array.from(this.todos.values()).filter((t) => t.owner_id === ownerId);

    if (listId) {
      items = items.filter((t) => t.list_id === listId);
    } else if (view) {
      switch (view) {
        case 'my_day':
          items = items.filter((t) => {
            if (!t.added_to_my_day_on) return false;
            const dateStr = String(t.added_to_my_day_on).split('T')[0];
            return dateStr === today;
          });
          break;
        case 'important':
          items = items.filter((t) => t.is_important);
          break;
        case 'planned':
          items = items.filter((t) => !!t.due_date);
          break;
        case 'completed':
          items = items.filter((t) => t.is_completed);
          break;
        case 'all':
        default:
          // Returns all
          break;
      }
    }

    return items
      .sort((a, b) => a.position - b.position)
      .map((t) => this.formatTodoWithSteps(t));
  }

  public getTodoById(id: string): TodoItem | null {
    const todo = this.todos.get(id);
    if (!todo) return null;
    return this.formatTodoWithSteps(todo);
  }

  public createTodo(ownerId: string, input: Partial<TodoItem>): TodoItem {
    const ownerTodos = Array.from(this.todos.values()).filter((t) => t.owner_id === ownerId);
    const maxPos = ownerTodos.reduce((max, t) => Math.max(max, t.position), -1);

    const newTodo: TodoItem = {
      id: `td-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      owner_id: ownerId,
      title: input.title || 'Untitled To-Do',
      notes: input.notes || null,
      is_completed: !!input.is_completed,
      completed_at: input.is_completed ? new Date().toISOString() : null,
      is_important: !!input.is_important,
      due_date: input.due_date || null,
      added_to_my_day_on: input.added_to_my_day_on || null,
      linked_task_id: input.linked_task_id || null,
      list_id: input.list_id || null,
      position: maxPos + 1,
      created_at: new Date().toISOString(),
    };

    this.todos.set(newTodo.id, newTodo);
    persistTodo(newTodo);
    return this.formatTodoWithSteps(newTodo);
  }

  public updateTodo(id: string, ownerId: string, input: Partial<TodoItem>): TodoItem {
    const todo = this.todos.get(id);
    if (!todo) throw new Error(`Todo with ID ${id} not found`);
    if (todo.owner_id !== ownerId) throw new Error('Unauthorized to update this todo');

    if (input.title !== undefined) todo.title = input.title;
    if (input.notes !== undefined) todo.notes = input.notes;
    if (input.due_date !== undefined) todo.due_date = input.due_date;
    if (input.is_important !== undefined) todo.is_important = input.is_important;
    if (input.list_id !== undefined) todo.list_id = input.list_id;
    if (input.linked_task_id !== undefined) todo.linked_task_id = input.linked_task_id;
    if (input.position !== undefined) todo.position = input.position;

    this.todos.set(id, todo);
    persistTodo(todo);
    return this.formatTodoWithSteps(todo);
  }

  public toggleComplete(id: string, ownerId: string, isCompleted?: boolean): TodoItem {
    const todo = this.todos.get(id);
    if (!todo) throw new Error(`Todo with ID ${id} not found`);
    if (todo.owner_id !== ownerId) throw new Error('Unauthorized to update this todo');

    const nextCompleted = isCompleted !== undefined ? isCompleted : !todo.is_completed;
    todo.is_completed = nextCompleted;
    todo.completed_at = nextCompleted ? new Date().toISOString() : null;

    this.todos.set(id, todo);
    persistTodo(todo);
    return this.formatTodoWithSteps(todo);
  }

  public toggleMyDay(id: string, ownerId: string, inMyDay?: boolean): TodoItem {
    const todo = this.todos.get(id);
    if (!todo) throw new Error(`Todo with ID ${id} not found`);
    if (todo.owner_id !== ownerId) throw new Error('Unauthorized to update this todo');

    const today = getTodayDateStr();
    const isCurrentlyInMyDay = !!todo.added_to_my_day_on && String(todo.added_to_my_day_on).startsWith(today);

    const nextInMyDay = inMyDay !== undefined ? inMyDay : !isCurrentlyInMyDay;
    todo.added_to_my_day_on = nextInMyDay ? today : null;

    this.todos.set(id, todo);
    persistTodo(todo);
    return this.formatTodoWithSteps(todo);
  }

  public reorderTodos(ownerId: string, items: Array<{ id: string; position: number }>): TodoItem[] {
    for (const item of items) {
      const todo = this.todos.get(item.id);
      if (todo && todo.owner_id === ownerId) {
        todo.position = item.position;
        this.todos.set(item.id, todo);
        persistTodo(todo);
      }
    }
    return this.getTodos(ownerId, 'all');
  }

  public deleteTodo(id: string, ownerId: string): boolean {
    const todo = this.todos.get(id);
    if (!todo) return false;
    if (todo.owner_id !== ownerId) throw new Error('Unauthorized to delete this todo');

    // Delete steps
    for (const [stepId, step] of this.todoSteps.entries()) {
      if (step.todo_id === id) {
        this.todoSteps.delete(stepId);
      }
    }

    this.todos.delete(id);
    persistDeleteTodo(id);
    return true;
  }

  // Steps Management
  public addStep(todoId: string, title: string): TodoStep {
    const steps = Array.from(this.todoSteps.values()).filter((s) => s.todo_id === todoId);
    const maxPos = steps.reduce((max, s) => Math.max(max, s.position), -1);

    const newStep: TodoStep = {
      id: `stp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      todo_id: todoId,
      title,
      is_done: false,
      position: maxPos + 1,
    };

    this.todoSteps.set(newStep.id, newStep);
    persistTodoStep(newStep);
    return newStep;
  }

  public updateStep(stepId: string, input: Partial<TodoStep>): TodoStep {
    const step = this.todoSteps.get(stepId);
    if (!step) throw new Error(`Step with ID ${stepId} not found`);

    if (input.title !== undefined) step.title = input.title;
    if (input.is_done !== undefined) step.is_done = input.is_done;
    if (input.position !== undefined) step.position = input.position;

    this.todoSteps.set(stepId, step);
    persistTodoStep(step);
    return step;
  }

  public deleteStep(stepId: string): boolean {
    persistDeleteTodoStep(stepId);
    return this.todoSteps.delete(stepId);
  }

  // Lists Management
  public getLists(ownerId: string): TodoList[] {
    return Array.from(this.todoLists.values())
      .filter((l) => l.owner_id === ownerId)
      .sort((a, b) => a.position - b.position);
  }

  public createList(ownerId: string, name: string, color = 'indigo'): TodoList {
    const lists = this.getLists(ownerId);
    const maxPos = lists.reduce((max, l) => Math.max(max, l.position), -1);

    const newList: TodoList = {
      id: `lst-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      owner_id: ownerId,
      name,
      color,
      position: maxPos + 1,
    };

    this.todoLists.set(newList.id, newList);
    persistTodoList(newList);
    return newList;
  }

  public updateList(listId: string, ownerId: string, input: Partial<TodoList>): TodoList {
    const list = this.todoLists.get(listId);
    if (!list) throw new Error(`List with ID ${listId} not found`);
    if (list.owner_id !== ownerId) throw new Error('Unauthorized to edit this list');

    if (input.name !== undefined) list.name = input.name;
    if (input.color !== undefined) list.color = input.color;
    if (input.position !== undefined) list.position = input.position;

    this.todoLists.set(listId, list);
    persistTodoList(list);
    return list;
  }

  public deleteList(listId: string, ownerId: string): boolean {
    const list = this.todoLists.get(listId);
    if (!list) return false;
    if (list.owner_id !== ownerId) throw new Error('Unauthorized to delete this list');

    // Remove list_id association from todos
    for (const todo of this.todos.values()) {
      if (todo.list_id === listId) {
        todo.list_id = null;
        this.todos.set(todo.id, todo);
      }
    }

    persistDeleteTodoList(listId);
    return this.todoLists.delete(listId);
  }

  // Manager & Report Summary
  public getTodoSummaryForUsers(users: import('../types').User[]): TodoSummary[] {
    const todayStr = getTodayDateStr();
    const now = new Date();

    return users.map((u) => {
      const userTodos = Array.from(this.todos.values()).filter((t) => t.owner_id === u.id);

      const openTodos = userTodos.filter((t) => !t.is_completed);
      const total_open = openTodos.length;

      const completed_today = userTodos.filter((t) => {
        if (!t.is_completed || !t.completed_at) return false;
        const compDateStr = new Date(t.completed_at).toISOString().split('T')[0];
        return compDateStr === todayStr;
      }).length;

      const overdue = openTodos.filter((t) => {
        if (!t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate < now && !t.is_completed;
      }).length;

      return {
        userId: u.id,
        userName: u.name,
        department: u.department,
        designation: u.designation,
        total_open,
        completed_today,
        overdue,
      };
    });
  }
}

export const todosStore = new TodosStore();
