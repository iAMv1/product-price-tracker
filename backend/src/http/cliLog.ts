/**
 * CLI request log for the observable headed recording (TOOLS-ONLY trigger).
 *
 * Off unless PPT_HTTP_LOG=1, which only backend/tools/recording-run.ts sets —
 * production, dev, and tests never see these lines. Two emitters share it:
 * the Express access log in app.ts and the upstream store fetch in
 * scraper/store/catalog.ts. Paths only, never query strings or headers, so
 * scheduler Bearer secrets can never appear in a recording.
 */
export function cliLogEnabled(): boolean {
  return process.env['PPT_HTTP_LOG'] === '1';
}

export function cliLog(line: string): void {
  if (cliLogEnabled()) console.log(line);
}
