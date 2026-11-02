import { todosStore } from '../../db/todosStore';
import { dbStore } from '../../db/prisma';
import { getAncestorIds, getSubordinateIds } from '../../permissions';
import { AppError } from '../../utils/errors';
import { User, TodoItem, TodoList, TodoStep, TodoSummary } from '../../types';

export class TodosService {
  static getTodos(ownerId: string, view?: string, listId?: string): TodoItem[] {
    return todosStore.getTodos(ownerId, view, listId);
  }

  static getTodoById(id: string): TodoItem | null {
    return todosStore.getTodoById(id);
  }

  static createTodo(ownerId: string, data: Partial<TodoItem>): TodoItem {
    return todosStore.createTodo(ownerId, data);
  }

  static updateTodo(id: string, ownerId: string, data: Partial<TodoItem>): TodoItem {
    return todosStore.updateTodo(id, ownerId, data);
  }

  static toggleComplete(id: string, ownerId: string, isCompleted?: boolean): TodoItem {
    return todosStore.toggleComplete(id, ownerId, isCompleted);
  }

  static toggleMyDay(id: string, ownerId: string, inMyDay?: boolean): TodoItem {
    return todosStore.toggleMyDay(id, ownerId, inMyDay);
  }

  static reorderTodos(ownerId: string, items: Array<{ id: string; position: number }>): TodoItem[] {
    return todosStore.reorderTodos(ownerId, items);
  }

  static deleteTodo(id: string, ownerId: string): boolean {
    return todosStore.deleteTodo(id, ownerId);
  }

  // Steps
  static addStep(todoId: string, ownerId: string, title: string): TodoStep {
    const todo = todosStore.getTodoById(todoId);
    if (!todo) throw AppError.notFound(`Todo with ID ${todoId} not found`);
    if (todo.owner_id !== ownerId) throw AppError.forbidden('Cannot modify steps on someone else’s todo');
    return todosStore.addStep(todoId, title);
  }

  static updateStep(stepId: string, ownerId: string, data: Partial<TodoStep>): TodoStep {
    const step = todosStore.todoSteps.get(stepId);
    if (!step) throw AppError.notFound(`Step with ID ${stepId} not found`);
    const todo = todosStore.getTodoById(step.todo_id);
    if (todo && todo.owner_id !== ownerId) throw AppError.forbidden('Cannot modify steps on someone else’s todo');
    return todosStore.updateStep(stepId, data);
  }

  static deleteStep(stepId: string, ownerId: string): boolean {
    const step = todosStore.todoSteps.get(stepId);
    if (!step) return false;
    const todo = todosStore.getTodoById(step.todo_id);
    if (todo && todo.owner_id !== ownerId) throw AppError.forbidden('Cannot modify steps on someone else’s todo');
    return todosStore.deleteStep(stepId);
  }

  // Lists
  static getLists(ownerId: string): TodoList[] {
    return todosStore.getLists(ownerId);
  }

  static createList(ownerId: string, name: string, color?: string): TodoList {
    return todosStore.createList(ownerId, name, color);
  }

  static updateList(listId: string, ownerId: string, data: Partial<TodoList>): TodoList {
    return todosStore.updateList(listId, ownerId, data);
  }

  static deleteList(listId: string, ownerId: string): boolean {
    return todosStore.deleteList(listId, ownerId);
  }

  // User Todo Access (strictly isolated to the user or Admin)
  static getUserTodosForManager(requester: User, targetUserId: string) {
    const targetUser = dbStore.users.get(targetUserId);
    if (!targetUser) throw AppError.notFound(`User ${targetUserId} not found`);

    // Check authorization: only target user themselves or ADMIN
    const isSelf = requester.id === targetUserId;
    const isAdmin = requester.role === 'ADMIN';

    if (!isSelf && !isAdmin) {
      throw AppError.forbidden('To-do lists are private to each employee.');
    }

    const todos = todosStore.getTodos(targetUserId, 'all');
    const lists = todosStore.getLists(targetUserId);

    return {
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        department: targetUser.department,
        designation: targetUser.designation,
        role: targetUser.role,
      },
      todos,
      lists,
    };
  }

  // To-Do Report Summary (strictly scoped)
  static getTodoSummaryReport(requester: User): TodoSummary[] {
    const allUsers = Array.from(dbStore.users.values()).filter((u) => u.is_active);

    let targetUsers: User[] = [];
    if (requester.role === 'ADMIN') {
      targetUsers = allUsers;
    } else {
      const self = allUsers.find((u) => u.id === requester.id);
      targetUsers = self ? [self] : [];
    }

    return todosStore.getTodoSummaryForUsers(targetUsers);
  }
}
