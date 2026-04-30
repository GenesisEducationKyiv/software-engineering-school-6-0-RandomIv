process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/github_notifier';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test-password';
process.env.RELEASE_CHECK_CRON = '*/5 * * * *';
process.env.API_KEY = 'test-api-key';
