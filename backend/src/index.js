import 'dotenv/config';

process.env.NODE_ENV ||= 'development';
if (process.env.NODE_ENV === 'development')
  process.env.COOKIE_SECURE ||= 'false';
const { app } = await import('./app.js');
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`EduQuest API listening on ${port}`));
