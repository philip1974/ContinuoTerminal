import { ZodError } from 'zod';

export function formatError(err: unknown): string {
  if (err instanceof ZodError) {
    return err.errors.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');
  }

  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
}
