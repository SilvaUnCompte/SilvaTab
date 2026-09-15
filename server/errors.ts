export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }

  static notFound(what: string, id: string) {
    return new AppError(404, `${what} ${id} not found`);
  }

  static badRequest(message: string) {
    return new AppError(400, message);
  }
}
