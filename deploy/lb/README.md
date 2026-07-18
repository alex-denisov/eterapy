# B540 — Fleet LB + Cloudflare geo-routing + 152-ФЗ data contours

Owner decision (2026-07-18): **free scheme, no paid Cloudflare Load Balancing.**
Cloudflare geo-routes to two HAProxy load balancers on the existing VMs
(eterapy-1 cloud.ru + eterapy-4 AWS), proxying (orange cloud) **on**, with
session affinity via cookie.

## Topology

```
                       Cloudflare (proxied, orange cloud)
                        cf-geo-router.worker.js (free)
                     reads request.cf.country → contour
                 ┌──────────────┴───────────────┐
        country == RU                      everything else
                 │                                │
        ru-lb.eterapy.com                intl-lb.eterapy.com
        HAProxy @ eterapy-1              HAProxy @ eterapy-4
        (cookie SRVID sticky)           (cookie SRVID sticky)
                 │                                │
        ┌────────┴────────┐              ┌────────┴────────┐
   eterapy-1 app     eterapy-2 app   eterapy-4 app     eterapy-3 app
        │  (RU contour)   │              │ (Foreign contour)│
   PG primary  ← stream → PG replica   PG primary ← stream → PG replica
        └── RU DB (РФ PDn) ──┘          └── Foreign DB (no РФ PDn) ──┘
              NO replication between contours (152-ФЗ)
   backups → cloud.ru S3 ×2            backups → AWS S3 (eterapy-foreign-backups)
```

## Why this satisfies 152-ФЗ

- **Two independent Postgres clusters, never replicated across the boundary.**
  RF citizens' personal data is stored only in the RU cluster (in RF). The
  Foreign cluster never receives РФ PDn.
- **Routing is by user home-region, not just request IP.** The Worker sends
  RF-country requests to the RU contour authoritatively (a stale affinity
  cookie cannot move an RF visitor to Foreign). The app records each user's
  home contour at registration (by declared residency / `cf-ipcountry`) so an
  RF user travelling abroad is still routed/redirected to the RU contour where
  their account lives.
- **Residual item for counsel:** requests transit the Cloudflare edge (already
  the project's accepted posture — CF fronts eterapy.com today). Data at rest
  stays in-contour. Track with the existing legal queue if a stricter reading
  is required.

## Session handling across contours

NextAuth JWTs are stateless with one `AUTH_SECRET` **per contour**. Within a
contour, a node failover never drops the session (no sticky needed for auth);
the HAProxy `SRVID` cookie pins a node only for LiveKit-room and rate-limit
locality. A user only ever authenticates against their home contour.

## Files

| File | Purpose |
|------|---------|
| `cf-geo-router.worker.js` | CF Worker: country → contour, affinity cookie |
| `haproxy.cfg.example` | contour LB config (copy per contour, fill IPs/cert) |
| `docker-compose.lb.yml` | opt-in `lb`-profile HAProxy container |

## Cutover runbook (LIVE — do with owner present, not solo)

This is the irreversible part; each step is reversible on its own, but the DB
split and DNS repoint affect live users. Suggested order:

1. **Foreign DB stands up first (no live users yet).** Bring the Foreign
   cluster's PG primary up on eterapy-4 with a fresh empty schema (migrations),
   replica on eterapy-3 (B537 streaming). Point eterapy-4/eterapy-3 apps at it.
2. **RU replica.** eterapy-1 → eterapy-2 streaming replica (B537), so the RU
   contour is HA before it goes behind an LB.
3. **HAProxy on eterapy-4 (Foreign)** first — no live RU traffic at risk.
   Validate `/api/health` through it on the sslip/origin hostname.
4. **HAProxy on eterapy-1 (RU):** free :443 (stop system nginx or bind HAProxy
   on an alt port with nginx proxying to it), start HAProxy, validate. Keep
   nginx config backed up (`eterapy.pre-container-cutover.bak` already exists).
5. **Cloudflare:** deploy the Worker, create the proxied `ru-lb`/`intl-lb`
   origin hostnames, route the app hostnames through the Worker. Verify from an
   RU IP and a non-RU IP that each lands on the correct contour.
6. **App: user home-contour assignment** at registration + wrong-contour
   redirect. Backfill existing users → RU contour (all current data is RF).
7. **Failover drill (owner present):** kill an app node — user unaffected
   (LB retries live node). Kill an LB — CF retries the other origin. Kill a PG
   primary — promote the replica (B537 procedure). Record RTO/RPO in DEPLOY.md.

Rollback at any step: repoint CF to the direct origin, stop HAProxy, restore
nginx :443. Sessions survive (stateless JWT).

## Ports (minimal; record in DEPLOY.md)

- Public per node: 22 (SSH, source-limited where possible), 443 (LB/origin).
- 443 on LB nodes: allow from Cloudflare ranges only (defence in depth).
- Inter-node: 5432 (PG replica, only the peer's IP), 3200 (LB→app, only LB IP).
- LiveKit RTC (B542): 7881/tcp + UDP range, only on LiveKit nodes.
