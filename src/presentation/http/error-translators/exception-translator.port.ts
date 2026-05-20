export interface HttpErrorResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface ExceptionTranslator {
  canHandle(error: unknown): boolean;
  translate(error: unknown): HttpErrorResponse;
}
