# Privacy / 隐私说明

This plugin runs entirely on your machine. It collects nothing for the author,
has no telemetry, and sends your data nowhere except Epic's own servers.

该插件完全运行在你的机器上：无遥测、无统计、无任何发往作者的数据；除 Epic
官方服务外不向任何第三方发送数据。

## What is stored where / 存了什么、存在哪

Everything lives under `$DSH_HOME/data/epic-autoclaim/` (`~/.dsh/data/epic-autoclaim/`
by default; installs of v1.3.x and earlier used `~/.dsh/data/epicgames-auto/`,
which v1.4+ moves to the new name automatically), with owner-only permissions
(`0700` directories, `0600` state file):

| Data | File | Content | Retention |
|---|---|---|---|
| Browser profile | `browser-profile/` | Epic **session cookies** (login state), no password ever | Until you delete it |
| Plugin state | `state.json` | Account id + display name, claim history (game titles/outcomes), activity log, schedule | Until you delete it |
| Diagnostic screenshots | `errors/*.png` | Full-page screenshots on automation failures — **may show your display name or library page** | Newest 20, auto-deleted after 7 days |

## What is sent where / 什么发到哪里

- `store-site-backend-static-ipv4.ak.epicgames.com` — free-game discovery. Request
  carries only your configured `country`/`locale`; no cookies, no identifiers.
- `store.epicgames.com`, `www.epicgames.com`, `store-content-ipv4.ak.epicgames.com`,
  `newassets.hcaptcha.com` — store/checkout/account traffic from the plugin's own
  browser profile (your logged-in session), exactly as a normal browser visit.
- Nothing else. The full egress list is the constants at the top of `lib/epic.js` —
  auditable in one place.

The plugin **never** sees or stores your Epic password: sign-in happens in a real
browser window you control. The local HTTP API (`/epic-autoclaim/api/*`) is bound
to the Harness GUI's loopback server and requires a plugin header plus a loopback
origin on every route; the status document masks your account id.

## Delete everything / 删除全部数据

```
rm -rf ~/.dsh/data/epic-autoclaim
```

That removes cookies, state, and screenshots. (If you ever ran v1.3.x or
earlier and skipped the automatic move, also remove `~/.dsh/data/epicgames-auto`
if it still exists.) Sign out of Epic in the plugin
first (or clear the profile above) if you also want the Epic-side web session
revoked from this machine.

## Sharing diagnostics / 分享诊断信息

If you file an issue, you may be asked for a screenshot from `errors/`. **Review
it first** — crop or blur your display name/email if visible. Never share the
`browser-profile/` directory: it contains live session cookies.
