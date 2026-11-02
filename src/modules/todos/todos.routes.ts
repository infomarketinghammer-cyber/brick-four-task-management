import { Router } from 'express';
import { TodosController } from './todos.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Protect all todo routes with authentication
router.use(authenticate);

// Reports
router.get('/reports/todo-summary', TodosController.getTodoSummaryReport);

// Custom Lists
router.get('/todo-lists', TodosController.getLists);
router.post('/todo-lists', TodosController.createList);
router.patch('/todo-lists/:id', TodosController.updateList);
router.delete('/todo-lists/:id', TodosController.deleteList);

// Manager Visibility
router.get('/todos/user/:userId', TodosController.getUserTodosForManager);

// Todos Reorder (must be before /todos/:id)
router.patch('/todos/reorder', TodosController.reorderTodos);

// Steps
router.post('/todos/:id/steps', TodosController.addStep);
router.patch('/todos/steps/:id', TodosController.updateStep);
router.delete('/todos/steps/:id', TodosController.deleteStep);

// Todos CRUD
router.get('/todos', TodosController.getTodos);
router.post('/todos', TodosController.createTodo);
router.patch('/todos/:id', TodosController.updateTodo);
router.patch('/todos/:id/complete', TodosController.toggleComplete);
router.patch('/todos/:id/my-day', TodosController.toggleMyDay);
router.delete('/todos/:id', TodosController.deleteTodo);

export default router;
