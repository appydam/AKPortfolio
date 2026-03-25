export async function register() {
  // Scheduler jobs are now individual exported functions in src/lib/jobs/scheduler.ts
  // They are meant to be invoked by Vercel Cron API routes instead of node-cron.
  // No background scheduler to start.
}
