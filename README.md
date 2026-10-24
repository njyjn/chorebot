# ChoreBot - Household Chore Tracker

Digital version of the Weekly Household Chore Tracker sheet. The helper ticks
chores off on the guardhouse tablet, ticks are stored locally in SQLite, and
Home Assistant gets a sensor plus a nightly alert listing anything left undone.

## Features

- **Checklist** (open on the intranet): today's chores grouped into *To do*,
  *Coming up*, *Done* and *Not due*. Tap to tick, tap again to undo. Today
  only; it cannot change or show other days.
- **Chore Audit** (Home Assistant sidebar, signed-in allowlisted users only):
  compliance, misses, late ticks and patterns, a Sun–Sat grid for corrections,
  the activity log, alert history, and chore management.
- **Reminders banner**: the "cannot forget" list, always on screen.
- **Alerts**: one digest per day at `alert_time` listing every overdue chore,
  sent through any of: a Home Assistant notify service, a Slack webhook, a
  Telegram bot.
- **Sensor**: `sensor.chorebot_outstanding` (count of chores due and not done),
  refreshed every minute and on every tick, with the list in the `outstanding`
  attribute.

The chore list from the sheet is seeded on first start. After that the
database is the source of truth.

## When a chore counts as overdue

Weeks run Sunday to Saturday, as on the sheet.

| Frequency | Due when |
|---|---|
| Daily | Not ticked today |
| Every N days | N or more days since the last tick |
| X / week | Fewer ticks this week than the pace needs: 2x/week needs 1 by Wednesday and 2 by Saturday; 1x/week needs 1 by Saturday |
| X / month | Same pacing over the month: 1x/month is due on the last day |

## Options

| Option | Default | Notes |
|---|---|---|
| `database_url` | `file:/share/chorebot.db` | Leave empty for the default |
| `port` | `3002` | |
| `helper_name` | `Aye Aye` | Recorded on each tick, shown in the header |
| `alert_time` | `20:00` | Local time (`HH:MM`) the daily digest is sent |
| `notify_service` | | e.g. `notify.nswuco` or `notify.mobile_app_jnw_16pm` |
| `notify_target` | | Passed as `target`, e.g. `#wucasa-chores` for the Slack notifier |
| `slack_webhook_url` | | Optional, independent of `notify_service` |
| `telegram_bot_token` | | Optional. Token from @BotFather. Telegram is used only when this and `telegram_chat_id` are both set |
| `telegram_chat_id` | | Where to post: a link such as `https://t.me/c/2190525348/1` (copy any message or topic link from the group), a chat ID (e.g. `-1001234567890`) or `@channelname`. A link to a forum topic posts into that topic |
| `reminders_title` | `TAKING CARE OF ZARA - CANNOT FORGET` | |
| `reminders` | the five lines from the sheet | Empty list hides the banner |
| `audit_users` | none | Home Assistant usernames (or user IDs) allowed to open Chore Audit. Empty means nobody |

To set up Telegram: create a bot with @BotFather and copy its token, add the
bot to the group, then right-click any message in the group (or the topic
to post into) and choose **Copy Message Link**. Paste that link into
`telegram_chat_id`. For a direct chat, send the bot a message, open
`https://api.telegram.org/bot<token>/getUpdates` and copy `chat.id`.

Times use the Home Assistant time zone, which the Supervisor passes to the add-on.

To check notifications without waiting for `alert_time`, use **Send test
alert** on the Chore Audit page. It sends the current overdue list without
recording it, and sends nothing if nothing is overdue.

## Chore Audit

Opens from the **Chore Audit** entry in the Home Assistant sidebar. Home
Assistant signs the user in and the Supervisor tells the add-on who it is;
only users listed in `audit_users` get the page. Everyone else gets a 403,
including the guardhouse kiosk user, even if an `addon-iframe-card` is
pointed at the add-on.

How it is protected:

- The audit page is served on the ingress port, which the Supervisor picks
  from the free ports on each start (logged as `Audit (ingress) on port N`),
  so it never clashes with another service. Because the add-on uses
  `host_network`, that port is reachable from the LAN, so it only accepts
  connections from the Supervisor (`172.30.32.2`). That is what makes the
  forwarded user headers trustworthy.
- The checklist port (3002) cannot reach any audit or alert endpoint.
- On start the add-on logs which `X-Remote-User-*` headers ingress sent, and
  every denied request with the reason.

What it shows, for the last 7, 30 or 90 days up to yesterday:

- **Compliance**: each time a chore falls due counts once. Done that day, or
  ticked earlier before it fell due, is met. Each day it stays overdue is
  another miss, so misses match what the nightly alert listed. Ticks beyond
  a weekly or monthly target are ignored.
- **Tick timing**: *after alert* (ticked on the day but at or after
  `alert_time`), *backfilled* (ticked on a later day, only possible from data
  before 0.2.0), *correction* (entered on the audit page).
- **Unticks**: removed ticks are kept and shown, with who removed them.
- **Ticks by hour**: a spike just before the alert suggests bulk ticking.
- **Week grid**: click a cell to record a chore as done on a past day, or to
  remove a tick. Corrections are attributed to the signed-in user.
- **Manage chores**: add, edit, remove. Removing archives the chore; its
  history stays in the stats up to the day it was removed.

## Guardhouse dashboard

Add to the Apps view next to BabyBot (point a reverse-proxy hostname at port
3002 first, as for `bb.intra.ngsim.net`, because the dashboard is served over HTTPS):

```yaml
type: custom:addon-iframe-card
url: https://<chorebot-hostname>
aspect_ratio: 100%
grid_options:
  columns: full
  rows: 12
```

And a badge for the outstanding count:

```yaml
type: entity
entity: sensor.chorebot_outstanding
```

## Releasing

Bump `version` in `config.yaml` (and `package.json`) and push to `main`. The
release workflow tags `v<version>`, pushes `ghcr.io/njyjn/chorebot` (arm64),
and dispatches `chorebot-released` to `njyjn/ha-addons`, which bumps the
submodule and `repository.json`. The dispatch needs the `HA_ADDONS_PAT`
repository secret.

## Development

```bash
npm install
DATABASE_URL="file:./data/chorebot.db" npx prisma migrate deploy
DATABASE_URL="file:./data/chorebot.db" npm run prisma:seed
DATABASE_URL="file:./data/chorebot.db" npm run dev
npm test             # scheduling and audit rules
```

`npm start` serves Next.js directly. To run the add-on layout locally, with
the checklist on 3002 and the audit page on 3003 (override with
`INGRESS_PORT`), run `node server.js` after
`npm run build`. Then send the headers ingress would send:

```bash
OPTIONS_PATH=./options.json AUDIT_TRUSTED_ADDR=127.0.0.1 node server.js
curl -H 'x-remote-user-name: justin' http://localhost:3003/
```
