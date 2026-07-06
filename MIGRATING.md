# Migrating from 1.x to 2.0

SnapOtter 1.x stored everything in a single SQLite file. 2.0 uses PostgreSQL and Redis. When you upgrade, 2.0 imports your 1.x database automatically on first boot, as long as it mounts your existing `/data` volume. Your users, saved files, settings, API keys, and pipelines come across, and the old database is never modified, so you can roll back.

> [!NOTE]
> A word to our 1.x users: many of you have been here since the start, and your trust and your feedback are why this guide exists. 2.0 changes a lot under the hood, and the whole point of the steps below is that your data comes with you and nothing you rely on breaks. Take the backup step, follow the path that matches your setup, and you'll land on 2.0 with everything intact.

## Back up the entire /data volume first

Do this before you upgrade. Back up the whole `/data` volume, not the `snapotter.db` file alone.

1.x runs SQLite in WAL mode, so a stopped container usually leaves most of its committed data in `snapotter.db-wal` beside an almost-empty `snapotter.db`. Copy only `snapotter.db` and you capture an empty database. The volume carries `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm`, and your `files/` directory together, and they have to travel as a set.

```bash
# Adjust the volume name to match yours: docker volume ls | grep -i snapotter
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Quick upgrade (single container)

Upgrade your 1.x install to 1.17.2 first so it runs its final schema migrations. Then point the 2.0 image at the same volume:

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

2.0 detects `/data/snapotter.db` and imports it on first boot. Log in with your existing credentials.

## Full guide

Compose upgrades, a dry-run preview, exactly what carries over, turning the import off, and rollback are all covered in the complete guide:

**https://docs.snapotter.com/guide/upgrading**
