/** Use authenticated user IDs, never user-editable profile metadata. */
export function isDeveloperUser(userId: string | undefined, allowedIds: string | undefined) {
  return !!userId && !!allowedIds?.split(",").some((id) => id.trim() === userId);
}
