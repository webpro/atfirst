import { fromMarkdown } from "mdast-util-from-markdown"
import { toHast } from "mdast-util-to-hast"
import { truncate as truncateHast } from "hast-util-truncate"
import { toHtml } from "hast-util-to-html"

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatDate(iso: string): string {
  return iso.slice(0, 10)
}

export function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text

  const cut = text.slice(0, limit)
  const parBreak = cut.lastIndexOf("\n\n")
  if (parBreak > limit * 0.3) return cut.slice(0, parBreak) + "\n\n…"

  const sentenceEnd = cut.search(/[.!?。]\s[^.!?。]*$/)
  if (sentenceEnd > limit * 0.3) return cut.slice(0, sentenceEnd + 1) + " …"

  const wordBreak = cut.lastIndexOf(" ")
  if (wordBreak > limit * 0.5) return cut.slice(0, wordBreak) + " …"

  return cut + "…"
}

export function truncateMarkdown(markdown: string, limit: number): string {
  const mdast = fromMarkdown(markdown)
  const hast = toHast(mdast)
  if (!hast) return ""
  const truncated = truncateHast(hast, { size: limit, ellipsis: "…" })
  return toHtml(truncated)
}

function renderDate(iso: string, href?: string): string {
  const content = href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener">${formatDate(iso)}</a>`
    : formatDate(iso)
  return `<time class="post-date" datetime="${iso}">${content}</time>`
}

export interface ItemView {
  date?: string
  dateHref?: string
  title?: string
  titleHref?: string
  body?: string
  author?: { name: string; handle: string; avatar?: string }
  stats?: { replies: number; reposts: number; likes: number }
  embed?: string
  replyContext?: { name: string; href: string; text: string }
  meta?: string
}

export function renderItem(view: ItemView): string {
  let html = `<article class="post">`

  if (view.author) {
    if (view.author.avatar) {
      html += `<img class="avatar" src="${esc(view.author.avatar)}" alt="" width="40" height="40">`
    }
    html += `<div class="author">${esc(view.author.name)} <span class="handle">@${esc(view.author.handle)}</span></div>`
    if (view.date) html += renderDate(view.date, view.dateHref)
  }

  if (view.replyContext) {
    html += `<div class="reply-ctx">Replying to <a href="${esc(view.replyContext.href)}">${esc(view.replyContext.name)}</a></div>`
    html += `<div class="reply-parent">${esc(view.replyContext.text)}</div>`
  }

  if (view.title) {
    const inner = view.titleHref
      ? `<a href="${esc(view.titleHref)}" target="_blank" rel="noopener">${esc(view.title)}</a>`
      : esc(view.title)
    html += `<h2 class="post-title">${inner}</h2>`
  }

  if (!view.author && view.date) html += renderDate(view.date, view.dateHref)

  if (view.body) html += `<div class="body">${view.body}</div>`
  if (view.embed) html += view.embed
  if (view.meta) html += `<div class="meta">${esc(view.meta)}</div>`

  if (view.stats) {
    html += `<div class="stats">${view.stats.replies} replies · ${view.stats.reposts} reposts · ${view.stats.likes} likes</div>`
  }

  html += `</article>`
  return html
}

export function genericView(value: Record<string, unknown>): ItemView {
  const date = typeof value.createdAt === "string" ? value.createdAt : undefined

  const skip = new Set(["$type", "createdAt"])
  const fields = Object.entries(value).filter(([k, v]) => !skip.has(k) && typeof v === "string" && v.length > 0)
  if (!fields.length) return { date }

  const longest = fields.reduce((a, b) => (b[1] as string).length > (a[1] as string).length ? b : a, fields[0])
  const parts: string[] = []
  for (const [key, val] of fields) {
    const s = val as string
    if (key === longest[0]) {
      parts.push(esc(truncateText(s, 200)))
    } else if (s.length > 100) {
      parts.push(esc(truncateText(s, 200)))
    }
  }

  return { date, body: parts.join("") }
}

const CSS = `*{box-sizing:border-box;margin:0}
:root{color-scheme:light dark;--bg:#fff;--fg:#000;--muted:#42576C;--card:#fff;--border:#dce2ea;--reply-bg:#f3f5f8;--link:#1185fe}
@media(prefers-color-scheme:dark){:root{--bg:#151d28;--fg:#fff;--muted:#8fa3b3;--card:#1b2535;--border:#2c3a4e;--reply-bg:#232e3e;--link:#1185fe}}
body{font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:1rem;background:var(--bg);color:var(--fg);display:flex;flex-direction:column;gap:1rem}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
.post{display:grid;grid-template-columns:auto 1fr auto;gap:.5rem;align-items:center;background:var(--card);padding:1rem;border-radius:8px;border:1px solid var(--border)}
.post>*{grid-column:1/-1}
.avatar{grid-column:1;border-radius:50%}
.author{grid-column:2;font-weight:600}
.post-title{grid-column:1/-2;min-width:0;font-size:1rem;font-weight:600}
.post-date{grid-column:-2/-1;color:var(--muted);white-space:nowrap}
.post-date a{color:inherit}
.handle{color:var(--muted);font-weight:normal}
.body{word-break:break-word;line-height:1.5;display:flex;flex-direction:column;gap:1rem;min-width:0}
.body img{max-width:100%;height:auto;border-radius:6px}
.body h1,.body h2,.body h3,.body h4,.body h5,.body h6{font-size:inherit;font-weight:600}
.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.5rem}
.images img{width:100%;border-radius:6px}
.card{display:block;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.card img{width:100%;border-radius:8px 8px 0 0}
.card-title,.card-desc,.card-url{display:block;padding:.25rem .75rem}
.card-title{font-weight:600;padding-top:.5rem}
.card-url{color:var(--muted);padding-bottom:.5rem}
.quote{border-left:3px solid var(--border);padding:.5rem .75rem}
.quote-author{font-weight:600}
.video{position:relative}
.video img{width:100%;border-radius:6px}
.video-badge{position:absolute;top:.5rem;right:.5rem;background:rgba(0,0,0,.7);color:#fff;padding:2px 8px;border-radius:4px}
.reply-ctx{color:var(--muted)}
.reply-parent{background:var(--reply-bg);border-left:3px solid var(--border);padding:.75rem 1rem;color:var(--muted);border-radius:4px}
.stats{color:var(--muted)}
.form-row{display:flex;gap:.5rem}
input,select{padding:.5rem;border:1px solid var(--border);border-radius:6px;font-size:inherit;background:var(--card);color:var(--fg)}
input{flex:1}
.tag{color:var(--link)}
.meta{color:var(--muted)}`

export function pageHead(title: string): string {
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${CSS}</style></head><body>`
  )
}
