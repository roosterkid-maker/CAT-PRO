export class Result<T> {
  private constructor(
    public readonly success: boolean,
    public readonly data: T | null,
    public readonly error: string | null,
  ) {}

  static ok<T>(data: T): Result<T> {
    return new Result<T>(
      true,
      data,
      null,
    );
  }

  static fail<T>(
    message: string,
  ): Result<T> {
    return new Result<T>(
      false,
      null,
      message,
    );
  }
}