# UlixDesk go-live

## For Anupa

UlixDesk is the staff time tracker. People sign in with an email and a password. There is no public signup page, and clients do not get accounts.

Two copies run on one small server:

- **Staging** is the rehearsal copy, at `https://staging.desk.ulixdigital.com`.
- **Production** is the real copy, at `https://desk.ulixdigital.com`.

### How a change reaches the team

A developer opens a pull request. GitHub runs the checks (lint, types, unit tests, and the browser tests). After the pull request is merged into `main`, those checks run again. Staging updates only if they pass. GitHub then builds one image, stores it, and installs that image on staging. Nothing is typed into the server by hand for a normal change.

### How a change reaches everyone

Production does not update by itself. Someone on the team opens GitHub → Actions → **Deploy production** → **Run workflow**, chooses **promote**, and pastes the commit id that is already on staging. GitHub then asks a reviewer to approve. After that approval, production starts the same image staging is already running. It does not build a second, different copy.

### If something breaks

Say so in the team channel and stop using the broken page. The team can step production back from the same **Deploy production** workflow by choosing **rollback**. That goes back one deployed image. Run it again to step back further. It does not swap the two newest images, and it does not need a new commit.

### How to add a team member

Sign in as an owner or an admin. Open **Team**. Enter the person's name and email, choose Member (or Admin, or Owner if you are an owner), and press **Add team member**. UlixDesk does not email them. Copy the set-password link that appears and send it yourself. The link works once and expires in 72 hours. They open it, choose a password, and then sign in.

To replace a forgotten password, press **Reset password** on that person and send the new link. The old link stops working. **Deactivate** signs them out and stops their extension sign-ins and access tokens. **Restore access** lets them sign in again. Old extension sign-ins and access tokens stay revoked, so they sign in from the extension again.

## For the team

### What runs on the server

One Docker Compose project:

| Container | Memory cap | Published ports |
| --- | --- | --- |
| Postgres 16 | 512 MB | none |
| app-staging | 384 MB | none |
| app-production | 384 MB | none |
| Caddy | 64 MB | 80, 443, and 443/udp (HTTP/3) |
| backup | 64 MB | none |

Caddy is the only process on the public internet. It terminates HTTPS and forwards the real `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`, plus a shared secret header (`X-Ulixdesk-Proxy`). Staging and production use different secrets. Caddy sends `ULIXDESK_STAGING_PROXY_SECRET` to the staging app and `ULIXDESK_PRODUCTION_PROXY_SECRET` to the production app. Each app trusts the forwarded headers only when that header matches its own `ULIXDESK_TRUSTED_PROXY_SECRET`. The apps and Postgres publish no host ports, and the deploy script starts each app with `--no-deps`, so the first staging deploy does not start production. Session cookies are `httpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production`.

Staging sets `ULIXDESK_ENVIRONMENT=staging` and shows a banner: “Staging. This is the rehearsal copy, not the live tracker.” Production sets `ULIXDESK_ENVIRONMENT=production` and does not show it.

`npm start` on a developer machine binds to `127.0.0.1`. Inside Docker the app listens on `0.0.0.0` so Caddy can reach it, and that port is not published on the host.

### Why one Postgres

Two Postgres processes would each keep their own cache on a 2 GB machine. One Postgres container with two databases is lighter. Staging uses the role `ulixdesk_staging` and database `ulixdesk_staging`. Production uses `ulixdesk_production` and `ulixdesk_production`. Staging's password cannot connect to the production database. Each app also caps its pool with `connection_limit=5`.

### First-time server setup

On the new Ubuntu VPS, as root, after an SSH key is in `authorized_keys`:

```bash
# Copy scripts/server-setup.sh to the server first, then:
sudo sh server-setup.sh
```

The script installs Docker and the Compose plugin, turns on unattended security upgrades, adds a 2 GB swap file when the machine has under about 2.5 GB of RAM, and sets the firewall to allow only SSH, port 80, and port 443. It turns off SSH password login only when an authorized key is already present.

Create `/opt/ulixdesk` and the env files from the examples in `env/`. Log the server into GHCR once so it can pull images:

```bash
docker login ghcr.io
```

Use a GitHub token with `read:packages`. Keep that token on the server only. Do not put it in the repository or in GitHub Actions. The Actions workflow pushes with the built-in `GITHUB_TOKEN`.

Build images in GitHub Actions, not on the VPS.

### DNS

Point both names at the VPS address:

- `A` `desk.ulixdigital.com`
- `A` `staging.desk.ulixdigital.com`

Caddy requests Let's Encrypt certificates for those names after the ports are open and the DNS is visible. Set `ACME_EMAIL` in the Caddy environment if you want a different account email. The default in the Caddyfile is `ops@ulixdigital.com`.

### Check that Caddy sees the real client address

Docker's userland proxy can hide the visitor. Caddy then logs a `172.x` or other docker-network address, and sign-in limits follow that address instead of the person. IPv6 can do the same if `ip6tables` is off.

From a computer that is not the VPS, note the public addresses and request both sites:

```bash
curl -4 -s https://ifconfig.me; echo
curl -6 -s https://ifconfig.me; echo
curl -4 -sI https://desk.ulixdigital.com/login
curl -6 -sI https://desk.ulixdigital.com/login
```

On the VPS, the Caddy log should show those same addresses in `remote_ip`:

```bash
cd /opt/ulixdesk
docker compose -f docker-compose.prod.yml logs caddy --since 2m
```

`remote_ip` must be the address from `ifconfig.me`, not a docker address (`172.16.0.0/12`, `10.0.0.0/8`, or a `fd` address). Repeat the `curl -6` check and confirm the IPv6 `remote_ip` is the laptop's IPv6 address.

If `remote_ip` is a docker address, turn off the userland proxy so iptables keeps the original source, including IPv6:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "userland-proxy": false,
  "ip6tables": true
}
EOF
sudo systemctl restart docker
cd /opt/ulixdesk && docker compose -f docker-compose.prod.yml up -d
```

Run the curl commands and the log command again. If the address is still hidden, run Caddy on the host network so it accepts the connection itself: set `network_mode: host` on the caddy service, remove its published `ports`, and point `reverse_proxy` at the app containers. Do not publish the app ports on the public interface. The userland-proxy change is the one to keep when the log already shows the real address.

### Env files

| File on the server | Example in the repo |
| --- | --- |
| `/opt/ulixdesk/env/postgres.env` | `env/postgres.env.example` |
| `/opt/ulixdesk/env/staging.env` | `env/staging.env.example` |
| `/opt/ulixdesk/env/production.env` | `env/production.env.example` |
| `/opt/ulixdesk/env/caddy.env` | `env/caddy.env.example` |

Local `npm run dev` uses `.env`, copied from `.env.example`. `.env` is not committed.

`ULIXDESK_STAGING_PROXY_SECRET` and `ULIXDESK_PRODUCTION_PROXY_SECRET` live in `caddy.env`. They must be different, and each must be at least 16 characters. `staging.env` sets `ULIXDESK_TRUSTED_PROXY_SECRET` to the staging value. `production.env` sets it to the production value. Leave the app secret unset for `npm run dev`. The laptop then ignores `X-Forwarded-*` and counts sign-in attempts as `127.0.0.1`.

Database passwords are letters and numbers only, because the first-boot SQL script inserts them. Session secrets are at least 32 characters, different per environment, and must not be the local development value on a `ulixdigital.com` host.

`ULIXDESK_MIGRATE_LOCK` is `8675309` for staging and `8675310` for production. Postgres advisory locks are shared across databases in one cluster, so the keys differ and the two apps can migrate at the same time. A second container of the same app waits on the lock, runs migrate, then starts. Only one of them migrates at a time.

### First deploy

1. Finish DNS, the server script, the three env files, and `docker login`.
2. Merge to `main`. After CI succeeds, the **Deploy staging** workflow builds `ghcr.io/<owner>/<repo>:<commit sha>`, pushes it, copies the compose files to `/opt/ulixdesk`, and starts staging only. Production is not started with that image.
3. Open staging, sign in as the bootstrap owner, change that password, and add the team.
4. Run **Deploy production** with that same 40-character commit SHA. That is the first time the production container starts.
5. Check that Caddy sees the real client address, using the commands under **Check that Caddy sees the real client address**.

The container entrypoint takes the migrate lock, runs `prisma migrate deploy`, runs the owner bootstrap, releases the lock, and then starts Next. The image turns Prisma telemetry off (`CHECKPOINT_DISABLE`) and points migrate at the query and schema engines already in the image, so a start does not download anything.

### Bootstrap owner

Set `ULIXDESK_BOOTSTRAP_EMAIL`, `ULIXDESK_BOOTSTRAP_PASSWORD` (at least 10 characters), and `ULIXDESK_BOOTSTRAP_NAME` in the env file before the first start. If the database has no users and those variables are missing, the app still starts and prints instructions. It does not create an open signup page, and it does not print the password.

When users already exist, bootstrap assigns any leftover unowned time entries, and the old workspace timer, to the earliest active owner. The same assignment is in `prisma/migrations/20261013121000_assign_legacy_owner`. On a brand-new database that migration changes nothing, because the owner does not exist yet. Bootstrap repeats it after creating the owner.

Locally:

```bash
npm run db:up
npx prisma migrate deploy
npm run user:bootstrap
npm run dev
```

Sign in at `http://127.0.0.1:3000/login` with the bootstrap email and password.

After that first sign-in, on staging and on production:

1. Open **Extension access** and use **Change password**. The current password is the bootstrap password. Choose a new one.
2. Remove `ULIXDESK_BOOTSTRAP_PASSWORD` from that environment's env file. Leave the email and name if you like. Bootstrap will not change the password on the next start, because the account already exists.
3. Recreate that app container so the process stops holding the old password. From `/opt/ulixdesk`:

```bash
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate app-staging
```

Use `app-production` for the live copy. `restart` alone does not reload the env file.

### Bringing across the Phase 1 database

A new database starts empty. That is the default. To copy the old SQLite file (clients, projects, time entries, and the running timer) after the owner exists:

```bash
npm run import:sqlite -- --from /path/to/phase1.db --dry-run
npm run import:sqlite -- --from /path/to/phase1.db
```

`--dry-run` prints the counts and writes nothing. The import assigns every time row to the earliest active owner. Run it again and it does nothing. If Postgres already has different clients, projects, or time, it refuses. Old extension tokens are not copied. After signing in on the web, each person signs in from the Chrome extension.

`DATABASE_URL` must point at the database you mean to fill. Do not point it at production unless that database is the one you intend to fill.

### Backups and restore

The backup container dumps both databases when it starts, then again every day at 03:15 UTC. Files are custom-format (`pg_dump -Fc`) under the `ulixdesk_backups` volume:

- `/backup/daily/<database>-YYYYMMDD.dump` — deleted after 7 days
- `/backup/weekly/<database>-YYYYMMDD.dump` — Sunday's copy, deleted after 28 days

Restore production (this replaces the data in that database):

```bash
cd /opt/ulixdesk
docker compose -f docker-compose.prod.yml stop app-production
./scripts/restore-backup.sh ulixdesk_production /backup/daily/ulixdesk_production-YYYYMMDD.dump
docker compose -f docker-compose.prod.yml start app-production
```

Use `ulixdesk_staging` and stop `app-staging` for the rehearsal database. Take a fresh dump first if the current data might still be needed.

### Rollback

Each deploy appends the image it started to `/opt/ulixdesk/staging-history` or `production-history`. The current image is also in `staging-tag` or `production-tag`.

Production: Actions → **Deploy production** → **rollback**. A reviewer still has to approve, because the job uses the `production` GitHub Environment. Each run removes the latest history line and starts the image that is now last. Run it again to step back further. It does not swap the two newest tags.

From the server, for staging or if GitHub is unavailable:

```bash
cd /opt/ulixdesk
./scripts/remote-deploy.sh production --rollback
./scripts/remote-deploy.sh staging --rollback
```

The image reference must be `ghcr.io/<owner>/<repo>:<40-character sha>`. The promote workflow rejects any other `image_tag`.

Create the GitHub Environment named `production` and add required reviewers before the first production run. Until those reviewers exist, GitHub will not ask anyone.

### Extension

The unpacked extension id is `cjlaoflbipaehclleojofopapalhiooe`. Put that in `ULIXDESK_EXTENSION_IDS` (already in the examples). Install steps are in [extension/README.md](../extension/README.md): Load unpacked, then sign in from the popup.

The popup defaults to `https://desk.ulixdigital.com`. **Use staging** points it at `https://staging.desk.ulixdigital.com`. **Custom server** is for a local origin such as `http://127.0.0.1:3000`. No new environment variable is required. Sign-in uses the same email, password, and rate limit as the website.

A timer started from the extension runs as that person. **Sign out** in the popup revokes that sign-in. Deactivating them, or changing their password, revokes every extension sign-in. Extension access lists each sign-in and can revoke one. An access token on that page remains an advanced fallback.

### Try the production stack on a laptop

This does not use the real DNS names or Let's Encrypt. Caddy makes a local certificate for `desk.localhost` and `staging.desk.localhost`.

```bash
node scripts/write-local-stack-env.mjs
docker compose -f docker-compose.prod.yml -f docker-compose.local.yml up -d --build
```

Open `https://desk.localhost` and `https://staging.desk.localhost`. The browser will warn about Caddy's local certificate. Accept it for this test, or trust Caddy's local CA. Sign in with the passwords written into `env/production.env` and `env/staging.env` (`local-owner-password` and `staging-owner-password`). Those files are gitignored.

Stop it with:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.local.yml down
```

### GitHub secrets

Set these on the repository. The values stay in GitHub. Do not commit them.

| Secret | What it is |
| --- | --- |
| `ULIXDESK_SSH_HOST` | The VPS address or hostname |
| `ULIXDESK_SSH_USER` | The SSH user that can run Docker |
| `ULIXDESK_SSH_PRIVATE_KEY` | The private key for that user, including the line breaks |
| `ULIXDESK_SSH_KNOWN_HOSTS` | One line from `ssh-keyscan -H <host>` for that server |

`GITHUB_TOKEN` is provided by Actions and is used only to push the image. No other GitHub secret is required.

These are **not** GitHub secrets. They live only on the server:

- `env/postgres.env`, `env/caddy.env`, `env/staging.env`, `env/production.env`
- The GHCR read token from `docker login ghcr.io`

There is no separate production SSH secret. Staging and production are the same machine.
