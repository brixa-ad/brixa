import { TASK_TYPES, isOneOf, type TaskType } from "./options";
import type { ErrorCode } from "./validation";

export type TaskInput = {
  title: string;
  type: TaskType;
  assignedTo: string;
  clientId: string | null;
  propertyId: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  /** HH:MM or null */
  dueTime: string | null;
  description: string;
};

export type TaskErrors = Partial<Record<keyof TaskInput, ErrorCode>>;

export const TASK_LIMITS = { title: 200, description: 2000, note: 2000 };

export function validateTask(input: TaskInput): TaskErrors {
  const errors: TaskErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = "required";
  else if (title.length < 2) errors.title = "tooShort";
  else if (title.length > TASK_LIMITS.title) errors.title = "tooLong";

  if (!isOneOf(TASK_TYPES, input.type)) errors.type = "invalid";
  if (!input.assignedTo) errors.assignedTo = "required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(input.dueDate))) {
    errors.dueDate = "invalid";
  }
  if (input.dueTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime)) errors.dueTime = "invalid";
  if (input.description.length > TASK_LIMITS.description) errors.description = "tooLong";
  return errors;
}
