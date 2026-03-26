export class InvalidFilterError extends Error {
  override name = "InvalidFilterError" as const
  constructor(message: string) {
    super(message)
  }
}

export class QueryTimeoutError extends Error {
  override name = "QueryTimeoutError" as const
  constructor(message: string = "Query execution timed out") {
    super(message)
  }
}

export class RefNotFoundError extends Error {
  override name = "RefNotFoundError" as const
  constructor(ref: string) {
    super(`Log ref not found: ${ref}`)
  }
}
