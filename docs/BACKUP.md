# EduQuest backups

## Native PostgreSQL

Against real PostgreSQL, use the native custom-format dump and restore commands:

```powershell
npm run backup:pg -- backups/eduquest.dump
npm run restore:pg -- backups/eduquest.dump
```

`backup:pg` reads `DATABASE_URL` and invokes `pg_dump`. `restore:pg` invokes
`pg_restore --clean --if-exists`; it is destructive to the target database and
must only be run against an intentionally selected EduQuest database. These
commands require PostgreSQL client binaries (`pg_dump` and `pg_restore`) on PATH.

## JSON fallback

PGlite/local environments without those binaries can use:

```powershell
npm run db:backup -- backups/eduquest.json
npm run db:restore -- backups/eduquest.json
npm run test:backup
```

This fallback is an application-level round trip and is not equivalent to a
native PostgreSQL backup for NFR13.
