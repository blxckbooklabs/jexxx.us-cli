export type DbErrorLike = {
  code?: string | null;
  message: string;
};

export function isDuplicateError(error: DbErrorLike): boolean {
  return (
    error.code === '23505' ||
    error.message.toLowerCase().includes('duplicate') ||
    error.message.toLowerCase().includes('unique')
  );
}

export function sanitizeDbError(error: DbErrorLike): string {
  if (isDuplicateError(error)) {
    return 'Duplicate entry detected by database constraints.';
  }
  if (error.code) {
    return `Database error (${error.code}). Check operator logs or MAMAbase status.`;
  }
  return 'Database error. Check operator logs or MAMAbase status.';
}