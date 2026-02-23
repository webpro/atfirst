import { esc, type ItemView } from "../render.ts"
import { BSKY_API, listRecords, type RawRecord } from "../feed.ts"

interface Author {
  handle: string
  displayName?: string
  avatar?: string
}

interface Facet {
  index: { byteStart: number; byteEnd: number }
  features: Array<{
    $type: string
    uri?: string
    did?: string
    tag?: string
  }>
}

interface EmbedView {
  $type: string
  images?: Array<{ thumb: string; fullsize: string; alt: string }>
  external?: { uri: string; title: string; description: string; thumb?: string }
  record?: { $type: string; author?: Author; value?: PostRecord }
  media?: EmbedView
  thumbnail?: string
  alt?: string
}

interface PostView {
  uri: string
  author: Author
  record: PostRecord
  embed?: EmbedView
  replyCount?: number
  repostCount?: number
  likeCount?: number
}

interface PostRecord {
  text: string
  createdAt: string
  facets?: Facet[]
  reply?: { parent: { uri: string }; root: { uri: string } }
}

export const id = "app.bsky.feed.post"
export const label = "Bluesky Posts"

export async function fetchRecords(did: string, pds: string, limit: number): Promise<RawRecord[]> {
  const isBskyPds = pds.includes(".host.bsky.network")
  if (isBskyPds) return listRecords(did, pds, id, limit, true)

  const [fwd, rev] = await Promise.all([
    listRecords(did, pds, id, limit),
    listRecords(did, pds, id, limit, true),
  ])
  const seen = new Set<string>()
  const merged: RawRecord[] = []
  for (const r of [...fwd, ...rev]) {
    if (!seen.has(r.uri)) { seen.add(r.uri); merged.push(r) }
  }
  merged.sort((a, b) => a.uri.localeCompare(b.uri))
  return merged.slice(0, limit)
}

export async function viewAll(records: RawRecord[], _actor: string): Promise<ItemView[]> {
  const uris = records.map((r) => r.uri)
  const uriSet = new Set(uris)
  const parentUris = [...new Set(
    records
      .map((r) => (r.value as unknown as PostRecord).reply?.parent.uri)
      .filter((u): u is string => !!u && !uriSet.has(u)),
  )]

  const postsQuery = `${BSKY_API}/app.bsky.feed.getPosts?` + uris.map((u) => `uris=${encodeURIComponent(u)}`).join("&")
  const parentQuery = parentUris.length
    ? `${BSKY_API}/app.bsky.feed.getPosts?` + parentUris.map((u) => `uris=${encodeURIComponent(u)}`).join("&")
    : null

  const [postsRes, parRes] = await Promise.all([
    fetch(postsQuery),
    parentQuery ? fetch(parentQuery) : null,
  ])

  if (!postsRes.ok) throw new Error(`API error ${postsRes.status}`)
  const postsData = (await postsRes.json()) as { posts: PostView[] }
  const postMap = new Map(postsData.posts.map((p) => [p.uri, p]))

  const parentMap = new Map<string, PostView>()
  if (parRes?.ok) {
    const parData = (await parRes.json()) as { posts: PostView[] }
    for (const p of parData.posts) parentMap.set(p.uri, p)
  }

  const items: ItemView[] = []
  for (const uri of uris) {
    const post = postMap.get(uri)
    if (!post) continue
    const parentUri = post.record.reply?.parent.uri
    const parentPost = parentUri ? (postMap.get(parentUri) ?? parentMap.get(parentUri)) : undefined
    items.push(postToView(post, parentPost))
  }
  return items
}

function postToView(post: PostView, parentPost?: PostView): ItemView {
  const rec = post.record
  const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`

  const view: ItemView = {
    date: rec.createdAt,
    dateHref: postUrl,
    author: {
      name: post.author.displayName || post.author.handle,
      handle: post.author.handle,
      avatar: post.author.avatar,
    },
    body: renderRichText(rec.text, rec.facets),
    embed: renderEmbed(post.embed) || undefined,
    stats: {
      replies: post.replyCount ?? 0,
      reposts: post.repostCount ?? 0,
      likes: post.likeCount ?? 0,
    },
  }

  if (parentPost) {
    view.replyContext = {
      name: parentPost.author.displayName || parentPost.author.handle,
      href: `/${parentPost.author.handle}`,
      text: parentPost.record.text,
    }
  }

  return view
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function isHttpUrl(uri: string): boolean {
  return uri.startsWith("https://") || uri.startsWith("http://")
}

function renderRichText(text: string, facets?: Facet[]): string {
  if (!facets?.length) return esc(text)

  const bytes = enc.encode(text)
  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart)
  const parts: string[] = []
  let cursor = 0

  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index
    if (byteStart < cursor || byteEnd > bytes.length) continue

    if (byteStart > cursor) {
      parts.push(esc(dec.decode(bytes.slice(cursor, byteStart))))
    }

    const facetText = esc(dec.decode(bytes.slice(byteStart, byteEnd)))
    const f = facet.features[0]

    if (f.$type === "app.bsky.richtext.facet#link" && f.uri && isHttpUrl(f.uri)) {
      parts.push(`<a href="${esc(f.uri)}" target="_blank" rel="noopener">${facetText}</a>`)
    } else if (f.$type === "app.bsky.richtext.facet#mention" && f.did) {
      parts.push(`<a href="/${facetText.replace(/^@/, "")}">${facetText}</a>`)
    } else if (f.$type === "app.bsky.richtext.facet#tag") {
      parts.push(`<span class="tag">${facetText}</span>`)
    } else {
      parts.push(facetText)
    }

    cursor = byteEnd
  }

  if (cursor < bytes.length) {
    parts.push(esc(dec.decode(bytes.slice(cursor))))
  }

  return parts.join("")
}

function renderEmbed(embed?: EmbedView): string {
  if (!embed) return ""
  const t = embed.$type

  if (t === "app.bsky.embed.images#view" && embed.images) {
    return `<div class="images">${embed.images.map(
      (img) => `<img src="${esc(img.fullsize)}" alt="${esc(img.alt)}" loading="lazy">`,
    ).join("")}</div>`
  }

  if (t === "app.bsky.embed.external#view" && embed.external && isHttpUrl(embed.external.uri)) {
    const e = embed.external
    let host = ""
    try { host = new URL(e.uri).hostname } catch { host = e.uri }
    return (
      `<a class="card" href="${esc(e.uri)}" target="_blank" rel="noopener">` +
      (e.thumb ? `<img src="${esc(e.thumb)}" alt="" loading="lazy">` : "") +
      `<span class="card-title">${esc(e.title)}</span>` +
      `<span class="card-desc">${esc(e.description)}</span>` +
      `<span class="card-url">${esc(host)}</span></a>`
    )
  }

  if (t === "app.bsky.embed.record#view" && embed.record) {
    const r = embed.record
    if (r.$type === "app.bsky.embed.record#viewRecord" && r.author && r.value) {
      return (
        `<blockquote class="quote">` +
        `<a href="/${esc(r.author.handle)}" class="quote-author">${esc(r.author.displayName || r.author.handle)}</a>` +
        `<p>${renderRichText(r.value.text, r.value.facets)}</p></blockquote>`
      )
    }
  }

  if (t === "app.bsky.embed.video#view" && embed.thumbnail) {
    return (
      `<div class="video"><img src="${esc(embed.thumbnail)}" alt="${esc(embed.alt || "Video")}" loading="lazy">` +
      `<span class="video-badge">Video</span></div>`
    )
  }

  if (t === "app.bsky.embed.recordWithMedia#view") {
    return (
      (embed.media ? renderEmbed(embed.media) : "") +
      (embed.record ? renderEmbed({ $type: "app.bsky.embed.record#view", record: embed.record }) : "")
    )
  }

  return ""
}
