import {context, reddit, redis, settings} from '@devvit/web/server'

const ALLOWED_API_HOSTS = new Set([
  'app.eterapy.com',
  'staging.app.eterapy.com',
])
const DEFAULT_API_BASE = 'https://app.eterapy.com'
const RESULT_TTL_MS = 90 * 24 * 60 * 60 * 1000
const PROCESSING_TTL_MS = 10 * 60 * 1000
type RedditThingId = `t1_${string}` | `t3_${string}`

export type PublicationCommand = {
  publicationId: string
  type: 'POST' | 'COMMENT'
  title: string
  body: string
  subreddit: string
  targetId: RedditThingId | null
}

export type PublicationResult = {
  publicationId: string
  status: 'PUBLISHED' | 'FAILED'
  externalPostId?: string
  publicUrl?: string
  error?: string
}

type StoredExecution = {
  state: 'PROCESSING' | 'DONE'
  result?: PublicationResult
}

export type BridgeDependencies = {
  subredditName: string
  getSetting: <T>(name: string) => Promise<T | undefined>
  fetchImpl: typeof fetch
  redisGet: (key: string) => Promise<string | undefined>
  redisSet: (
    key: string,
    value: string,
    options?: {nx?: boolean; expiration?: Date},
  ) => Promise<string>
  submitPost: (input: {
    subredditName: string
    title: string
    text: string
    runAs: 'APP'
  }) => Promise<{id: string; url: string}>
  submitComment: (input: {
    id: RedditThingId
    text: string
    runAs: 'APP'
  }) => Promise<{id: string; url: string}>
}

function runtimeDependencies(): BridgeDependencies {
  return {
    subredditName: context.subredditName,
    getSetting: name => settings.get(name),
    fetchImpl: fetch,
    redisGet: key => redis.get(key),
    redisSet: (key, value, options) => redis.set(key, value, options),
    submitPost: input => reddit.submitPost(input),
    submitComment: input => reddit.submitComment(input),
  }
}

function validCommand(value: unknown): value is PublicationCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const command = value as Record<string, unknown>
  return (
    typeof command.publicationId === 'string' &&
    command.publicationId.length > 0 &&
    command.publicationId.length <= 100 &&
    (command.type === 'POST' || command.type === 'COMMENT') &&
    typeof command.title === 'string' &&
    command.title.length <= 300 &&
    typeof command.body === 'string' &&
    command.body.length > 0 &&
    command.body.length <= 40_000 &&
    typeof command.subreddit === 'string' &&
    /^[A-Za-z0-9_]{2,21}$/.test(command.subreddit) &&
    (command.targetId === null ||
      (typeof command.targetId === 'string' &&
        /^t[13]_[a-z0-9]+$/i.test(command.targetId)))
  )
}

export function parseCommands(value: unknown): PublicationCommand[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid ETerapy command response')
  }
  const commands = (value as {commands?: unknown}).commands
  if (
    !Array.isArray(commands) ||
    commands.length > 5 ||
    !commands.every(validCommand)
  ) {
    throw new Error('Invalid ETerapy command response')
  }
  return commands
}

function apiBase(value: string | undefined): string {
  const url = new URL(value?.trim() || DEFAULT_API_BASE)
  if (url.protocol !== 'https:' || !ALLOWED_API_HOSTS.has(url.hostname)) {
    throw new Error('ETerapy API base URL is not allowed')
  }
  return url.origin
}

function executionKey(publicationId: string): string {
  return `eterapy:publication:${publicationId}`
}

async function report(
  base: string,
  secret: string,
  subreddit: string,
  result: PublicationResult,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(`${base}/api/integrations/reddit/devvit`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'X-Devvit-Subreddit': subreddit,
    },
    body: JSON.stringify(result),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`ETerapy result endpoint HTTP ${response.status}`)
  }
}

async function execute(
  command: PublicationCommand,
  deps: BridgeDependencies,
): Promise<PublicationResult> {
  if (
    command.subreddit.toLocaleLowerCase('en-US') !==
    deps.subredditName.toLocaleLowerCase('en-US')
  ) {
    return {
      publicationId: command.publicationId,
      status: 'FAILED',
      error: 'Command subreddit does not match this installation',
    }
  }
  try {
    if (command.type === 'POST') {
      const post = await deps.submitPost({
        subredditName: command.subreddit,
        title: command.title,
        text: command.body,
        runAs: 'APP',
      })
      return {
        publicationId: command.publicationId,
        status: 'PUBLISHED',
        externalPostId: post.id,
        publicUrl: post.url,
      }
    }
    if (!command.targetId) throw new Error('Comment target is missing')
    const comment = await deps.submitComment({
      id: command.targetId,
      text: command.body,
      runAs: 'APP',
    })
    return {
      publicationId: command.publicationId,
      status: 'PUBLISHED',
      externalPostId: comment.id,
      publicUrl: comment.url,
    }
  } catch (error) {
    return {
      publicationId: command.publicationId,
      status: 'FAILED',
      error: (error instanceof Error
        ? error.message
        : 'Reddit publication failed'
      ).slice(0, 500),
    }
  }
}

export async function syncOnce(
  overrides?: BridgeDependencies,
): Promise<{received: number; executed: number; reported: number}> {
  const deps = overrides ?? runtimeDependencies()
  const secret = (await deps.getSetting<string>('eterapy_api_secret'))?.trim()
  if (!secret) throw new Error('ETerapy bridge secret is not configured')
  const base = apiBase(await deps.getSetting<string>('eterapy_api_base_url'))

  const response = await deps.fetchImpl(
    `${base}/api/integrations/reddit/devvit`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${secret}`,
        'X-Devvit-Subreddit': deps.subredditName,
      },
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) {
    throw new Error(`ETerapy command endpoint HTTP ${response.status}`)
  }
  const commands = parseCommands(await response.json())
  let executed = 0
  let reported = 0

  for (const command of commands) {
    const key = executionKey(command.publicationId)
    const storedRaw = await deps.redisGet(key)
    const stored = storedRaw ? (JSON.parse(storedRaw) as StoredExecution) : null
    if (stored?.state === 'DONE' && stored.result) {
      await report(
        base,
        secret,
        deps.subredditName,
        stored.result,
        deps.fetchImpl,
      )
      reported += 1
      continue
    }
    if (stored?.state === 'PROCESSING') continue

    const claimed = await deps.redisSet(
      key,
      JSON.stringify({state: 'PROCESSING'} satisfies StoredExecution),
      {nx: true, expiration: new Date(Date.now() + PROCESSING_TTL_MS)},
    )
    if (!claimed) continue

    const result = await execute(command, deps)
    executed += 1
    await deps.redisSet(
      key,
      JSON.stringify({state: 'DONE', result} satisfies StoredExecution),
      {expiration: new Date(Date.now() + RESULT_TTL_MS)},
    )
    await report(base, secret, deps.subredditName, result, deps.fetchImpl)
    reported += 1
  }

  return {received: commands.length, executed, reported}
}
