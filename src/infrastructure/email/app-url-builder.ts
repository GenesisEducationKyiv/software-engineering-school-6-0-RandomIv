export class AppUrlBuilder {
  private readonly base: string;
  constructor(baseUrl: string) { this.base = baseUrl.replace(/\/+$/, ''); }
  webPath(path: string): string { return `${this.base}/web${path}`; }
}
