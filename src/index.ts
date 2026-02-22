// --- Types ---

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

interface FeedItem {
  post: PostView
  parentPost?: PostView
}

// --- Utilities ---

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function isHttpUrl(uri: string): boolean {
  return uri.startsWith("https://") || uri.startsWith("http://")
}

const enc = new TextEncoder()
const dec = new TextDecoder()

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

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

// --- Renderers ---

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

function renderPost(item: FeedItem): string {
  const { post, parentPost } = item
  const rec = post.record
  let html = `<article class="post">`

  if (parentPost) {
    html +=
      `<div class="reply-ctx">Replying to <a href="/${esc(parentPost.author.handle)}">` +
      `${esc(parentPost.author.displayName || parentPost.author.handle)}</a></div>`
    html += `<div class="reply-parent"><p>${esc(parentPost.record.text)}</p></div>`
  }

  html += `<div class="author">`
  if (post.author.avatar) {
    html += `<img class="avatar" src="${esc(post.author.avatar)}" alt="" width="40" height="40">`
  }
  html +=
    `<div><strong>${esc(post.author.displayName || post.author.handle)}</strong> ` +
    `<span class="handle">@${esc(post.author.handle)}</span></div>` +
    `<time datetime="${rec.createdAt}"><a href="https://bsky.app/profile/${esc(post.author.handle)}/post/${post.uri.split("/").pop()}" target="_blank" rel="noopener">${fmtDate(rec.createdAt)}</a></time></div>`

  html += `<div class="body">${renderRichText(rec.text, rec.facets)}</div>`
  html += renderEmbed(post.embed)

  html +=
    `<div class="stats">` +
    `<span>${post.replyCount ?? 0} replies</span>` +
    `<span>${post.repostCount ?? 0} reposts</span>` +
    `<span>${post.likeCount ?? 0} likes</span></div>`

  html += `</article>`
  return html
}

// --- Page Shell ---

const CSS = `*{box-sizing:border-box;margin:0}
:root{color-scheme:light dark;--bg:#fff;--fg:#000;--muted:#42576C;--card:#fff;--border:#dce2ea;--reply-bg:#f3f5f8;--reply-border:#dce2ea;--reply-fg:#42576C;--link:#1185fe;--input-border:#dce2ea}
@media(prefers-color-scheme:dark){:root{--bg:#151d28;--fg:#fff;--muted:#8fa3b3;--card:#1b2535;--border:#2c3a4e;--reply-bg:#232e3e;--reply-border:#2c3a4e;--reply-fg:#7b8d9e;--link:#1185fe;--input-border:#2c3a4e}}
body{font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:1rem;background:var(--bg);color:var(--fg)}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
.post{background:var(--card);padding:1rem;border-radius:8px;margin-bottom:1rem;border:1px solid var(--border)}
.author{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
.author time{margin-left:auto;font-size:.85rem}
.author time a{color:var(--muted)}
.avatar{border-radius:50%}
.handle{color:var(--muted);font-weight:normal}
.body{white-space:pre-wrap;word-break:break-word;line-height:1.5}
.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.5rem;margin-top:.75rem}
.images img{width:100%;border-radius:6px;display:block}
.card{display:block;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:.75rem}
.card img{width:100%;border-radius:8px 8px 0 0}
.card-title,.card-desc,.card-url{display:block;padding:.25rem .75rem;font-size:.85rem}
.card-title{font-weight:600;padding-top:.5rem}
.card-url{color:var(--muted);padding-bottom:.5rem}
.quote{border-left:3px solid var(--border);padding:.5rem .75rem;margin-top:.75rem;font-size:.9rem}
.quote-author{font-weight:600}
.video{position:relative;margin-top:.75rem}
.video img{width:100%;border-radius:6px}
.video-badge{position:absolute;top:.5rem;right:.5rem;background:rgba(0,0,0,.7);color:#fff;padding:2px 8px;border-radius:4px;font-size:.75rem}
.reply-ctx{font-size:.85rem;color:var(--muted);margin-bottom:.25rem}
.reply-parent{background:var(--reply-bg);border-left:3px solid var(--reply-border);padding:.75rem 1rem;margin-bottom:1rem;font-size:.9rem;color:var(--reply-fg);border-radius:4px}
.stats{display:flex;gap:1rem;color:var(--muted);font-size:.85rem;margin-top:.75rem}
h1{margin-bottom:1rem}
form{margin-bottom:1.5rem}
input{width:100%;padding:.5rem;border:1px solid var(--input-border);border-radius:6px;font-size:1rem;background:var(--card);color:var(--fg)}
.tag{color:var(--link)}`

function page(title: string, content: string): Response {
  const html =
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${CSS}</style></head><body>${content}</body></html>`
  return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } })
}

// --- Worker ---

async function fetchFeed(handle: string): Promise<FeedItem[]> {
  const API = "https://public.api.bsky.app/xrpc"

  // 1. Resolve handle → DID → PDS endpoint
  const idRes = await fetch(`${API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)
  if (!idRes.ok) throw new Error("Could not resolve handle")
  const { did } = (await idRes.json()) as { did: string }

  const plcRes = await fetch(`https://plc.directory/${did}`)
  if (!plcRes.ok) throw new Error("Could not resolve DID")
  const didDoc = (await plcRes.json()) as {
    service: Array<{ id: string; serviceEndpoint: string }>
  }
  const pds = didDoc.service.find((s) => s.id === "#atproto_pds")?.serviceEndpoint
  if (!pds) throw new Error("No PDS found")

  // 2. Get the 10 oldest post records
  const listUrl =
    `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}` +
    `&collection=app.bsky.feed.post&limit=10`
  const isBskyPds = new URL(pds).hostname.endsWith(".host.bsky.network")
  type Rec = { uri: string; value: PostRecord }
  const parse = async (r: Response): Promise<Rec[]> =>
    r.ok ? ((await r.json()) as { records: Rec[] }).records : []
  let records: Rec[]
  if (isBskyPds) {
    // Bluesky PDS: default is newest-first, reverse=true gives oldest-first
    const res = await fetch(`${listUrl}&reverse=true`)
    if (!res.ok) throw new Error(`PDS error ${res.status}`)
    records = await parse(res)
  } else {
    // Unknown PDS: fetch both orderings in parallel, merge, take oldest 10
    const [res1, res2] = await Promise.all([fetch(listUrl), fetch(`${listUrl}&reverse=true`)])
    const seen = new Set<string>()
    const all: Rec[] = []
    for (const r of [...(await parse(res1)), ...(await parse(res2))]) {
      if (!seen.has(r.uri)) { seen.add(r.uri); all.push(r) }
    }
    const rkey = (uri: string) => uri.split("/").pop()!
    all.sort((a, b) => rkey(a.uri).localeCompare(rkey(b.uri)))
    records = all.slice(0, 10)
  }
  if (!records.length) throw new Error("No posts found")

  // 3. Hydrate with getPosts for full views (embeds, counts, avatars)
  const uris = records.map((r) => r.uri)
  const postsRes = await fetch(
    `${API}/app.bsky.feed.getPosts?` + uris.map((u) => `uris=${encodeURIComponent(u)}`).join("&"),
  )
  if (!postsRes.ok) throw new Error(`API error ${postsRes.status}`)
  const postsData = (await postsRes.json()) as { posts: PostView[] }

  const postMap = new Map(postsData.posts.map((p) => [p.uri, p]))

  // 4. Fetch parent posts for replies
  const parentUris = postsData.posts
    .map((p) => p.record.reply?.parent.uri)
    .filter((u): u is string => !!u && !postMap.has(u))
  const parentMap = new Map<string, PostView>()
  if (parentUris.length) {
    const parRes = await fetch(
      `${API}/app.bsky.feed.getPosts?` + parentUris.map((u) => `uris=${encodeURIComponent(u)}`).join("&"),
    )
    if (parRes.ok) {
      const parData = (await parRes.json()) as { posts: PostView[] }
      for (const p of parData.posts) parentMap.set(p.uri, p)
    }
  }

  // 5. Build feed items in original (oldest-first) order
  const items: FeedItem[] = []
  for (const uri of uris) {
    const post = postMap.get(uri)
    if (!post) continue
    const parentUri = post.record.reply?.parent.uri
    const parentPost = parentUri ? (postMap.get(parentUri) ?? parentMap.get(parentUri)) : undefined
    items.push({ post, parentPost })
  }

  return items
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.slice(1)
    const rawActor = url.searchParams.get("actor")?.trim()
      || (path && !path.includes("/") ? decodeURIComponent(path) : "")
    const actor = rawActor.replace(/^@/, "")

    // Redirect ?actor= or /@handle to clean /handle URL
    if ((url.searchParams.has("actor") && actor) || rawActor !== actor) {
      return Response.redirect(new URL(`/${actor}`, url.origin).href, 302)
    }

    let feedHtml = ""
    if (actor) {
      try {
        const items = await fetchFeed(actor)
        feedHtml = items.map(renderPost).join("") || "<p>No posts found.</p>"
      } catch (err) {
        feedHtml = `<p class="error">${esc(err instanceof Error ? err.message : "Unknown error")}</p>`
      }
    }

    return page(
      actor ? `@${actor} - at first` : "at first",
      `<h1>at first</h1>` +
        `<form><input name="actor" placeholder="handle.bsky.social" value="${esc(actor || "")}" aria-label="Bluesky handle" required></form>` +
        feedHtml,
    )
  },
} satisfies ExportedHandler
