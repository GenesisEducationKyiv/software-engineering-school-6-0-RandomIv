export interface WebErrorPage {
  status: number;
  title: string;
  message: string;
}

export interface WebExceptionTranslator {
  canHandle(error: unknown): boolean;
  translate(error: unknown): WebErrorPage;
}
