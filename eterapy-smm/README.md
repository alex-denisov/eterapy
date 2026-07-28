# ETerapy Reddit companion

Installation-scoped Reddit/Devvit adapter for the ETerapy marketing service.
ETerapy remains the source of truth for schedules, generated copy, independent
LLM review and Telegram moderation. This app only executes already-approved
Reddit commands inside the subreddit where it is installed and reports the
result back.

## Safety and execution contract

- The app runs as the Devvit app, never as the owner's personal Reddit account.
- It can publish only in its installation subreddit.
- Comments reach the bridge only after ETerapy's Telegram premoderation.
- The API base is restricted to `app.eterapy.com` or staging.
- A shared bearer secret authenticates both directions and is stored as a
  Devvit secret plus the production `REDDIT_DEVVIT_SHARED_SECRET`.
- Redis claims every publication id before the Reddit call and retains the
  result for 90 days, so retries do not duplicate posts or comments.
- Missing settings, malformed commands and subreddit mismatches fail closed.

## Local verification

```bash
npm ci
npm test
```

`npm test` runs TypeScript, Biome, unit tests and a Devvit build.

## Installation

1. Create or choose a subreddit moderated by the ETerapy account.
2. Generate one long random bridge secret and configure the same value as the
   Devvit global setting `eterapy_api_secret` and the ETerapy production secret
   `REDDIT_DEVVIT_SHARED_SECRET`.
3. Keep `eterapy_api_base_url=https://app.eterapy.com`.
4. Upload and install through the official Devvit CLI flow.
5. Configure `REDDIT_DEVVIT_SUBREDDITS` in ETerapy to the exact installation
   subreddit list.
6. Run one approved test post, verify the recorded `publicUrl`, then enable the
   recurring five-minute scheduler.

The Devvit adapter does not provide cross-subreddit discovery. Reddit's Data
API approval remains the route for compliant discovery outside the installation
subreddit.
