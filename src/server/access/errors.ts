/**
 * Thrown by the data access layer when the actor's role has no right on a
 * resource. Objects owned by someone else are filtered out by the query
 * itself and simply absent, not refused with this error.
 */
export class AccessDeniedError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "AccessDeniedError";
  }
}
