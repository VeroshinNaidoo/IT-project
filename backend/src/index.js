import 'dotenv/config';

process.env.NODE_ENV ||= 'development';
if (process.env.NODE_ENV === 'development')
  process.env.COOKIE_SECURE ||= 'false';
await import('./app.js');
