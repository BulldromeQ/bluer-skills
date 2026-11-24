/**
 * An error with a message meant for the user. The CLI prints the message
 * without a stack trace. Any other error is a bug and keeps its stack.
 */
export class BluerError extends Error {
  override name = "BluerError";
}
