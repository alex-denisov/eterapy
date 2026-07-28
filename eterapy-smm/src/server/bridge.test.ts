import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  type BridgeDependencies,
  type PublicationCommand,
  parseCommands,
  syncOnce,
} from './bridge.ts'

const postCommand: PublicationCommand = {
  publicationId: 'publication-1',
  type: 'POST',
  title: 'A useful reflection',
  body: 'A short body.',
  subreddit: 'eterapy',
  targetId: null,
}

function dependencies(commands: PublicationCommand[]): {
  deps: BridgeDependencies
  requests: Array<{url: string; init?: RequestInit}>
  posts: Array<unknown>
} {
  const requests: Array<{url: string; init?: RequestInit}> = []
  const posts: Array<unknown> = []
  const values = new Map<string, string>()
  const deps: BridgeDependencies = {
    subredditName: 'eterapy',
    getSetting: async name =>
      (name === 'eterapy_api_secret'
        ? 'test-secret'
        : 'https://app.eterapy.com') as never,
    fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      requests.push({url, init})
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ok: true}), {status: 200})
      }
      return new Response(JSON.stringify({commands}), {status: 200})
    }) as typeof fetch,
    redisGet: async key => values.get(key),
    redisSet: async (key, value, options) => {
      if (options?.nx && values.has(key)) return ''
      values.set(key, value)
      return 'OK'
    },
    submitPost: async input => {
      posts.push(input)
      return {
        id: 't3_published',
        url: 'https://www.reddit.com/r/eterapy/comments/published',
      }
    },
    submitComment: async () => {
      throw new Error('not expected')
    },
  }
  return {deps, requests, posts}
}

test('rejects an invalid or oversized command response', () => {
  assert.throws(() => parseCommands({commands: [{type: 'POST'}]}))
  assert.throws(() => parseCommands({commands: Array.from({length: 6})}))
})

test('publishes once and reports the durable result', async () => {
  const {deps, posts, requests} = dependencies([postCommand])

  assert.deepEqual(await syncOnce(deps), {
    received: 1,
    executed: 1,
    reported: 1,
  })
  assert.equal(posts.length, 1)
  assert.equal(requests.length, 2)
  assert.equal(requests[1]?.init?.method, 'POST')
  assert.equal(
    (requests[1]?.init?.headers as Record<string, string>).Authorization,
    'Bearer test-secret',
  )

  assert.deepEqual(await syncOnce(deps), {
    received: 1,
    executed: 0,
    reported: 1,
  })
  assert.equal(posts.length, 1)
})

test('fails closed when a command targets another installation', async () => {
  const {deps, posts, requests} = dependencies([
    {...postCommand, subreddit: 'another_sub'},
  ])

  assert.deepEqual(await syncOnce(deps), {
    received: 1,
    executed: 1,
    reported: 1,
  })
  assert.equal(posts.length, 0)
  const reported = JSON.parse(String(requests[1]?.init?.body)) as {
    status: string
    error: string
  }
  assert.equal(reported.status, 'FAILED')
  assert.match(reported.error, /does not match/)
})
