import { resolveHandle, describeRepo, listRecords, type RawRecord } from "./feed.ts"
import { esc, pageHead, renderItem, genericView, type ItemView } from "./render.ts"
import * as bskyPost from "./collections/bsky-post.ts"
import * as whitewindBlog from "./collections/whitewind-blog.ts"
import * as frontpagePost from "./collections/frontpage-post.ts"
import * as pskyPost from "./collections/psky-post.ts"
import * as leafletDocument from "./collections/leaflet-document.ts"

interface Env {
  CACHE: KVNamespace
}

interface Collection {
  id: string
  label: string
  reverse?: boolean
  fetchRecords?(did: string, pds: string, limit: number): Promise<RawRecord[]>
  viewAll(records: RawRecord[], actor: string, pds: string): ItemView[] | Promise<ItemView[]>
}

const LIMIT = 10
const COLLECTIONS: Collection[] = [
  bskyPost,
  frontpagePost,
  leafletDocument,
  pskyPost,
  whitewindBlog,
];
const collectionMap = new Map(COLLECTIONS.map((c) => [c.id, c]))
const defaultViewAll: Collection["viewAll"] = (records, _actor, _pds) =>
  records.map((r) => genericView(r.value))
const DEFAULT_COLLECTION = bskyPost.id

function renderForm(actor: string, collectionId: string, repoCollections?: Set<string>): string {
  const options = COLLECTIONS.map(({ id, label }) => {
    const selected = id === collectionId ? " selected" : ""
    const disabled = repoCollections && !repoCollections.has(id) ? " disabled" : ""
    return `<option value="${esc(id)}"${selected}${disabled}>${esc(label)}</option>`
  }).join("")

  return (
    `<form><div class="form-row">` +
    `<input name="actor" placeholder="handle.bsky.social" value="${esc(actor)}" aria-label="Handle" required>` +
    `<select name="collection" aria-label="Collection" onchange="let a=this.form.actor.value.trim();if(a)location.href='/'+a+'/'+this.value">${options}</select>` +
    `</div></form>`
  )
}

const HTML_HEADERS = { "content-type": "text/html;charset=UTF-8" }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.slice(1).split("/").filter(Boolean)
    const rawActor = url.searchParams.get("actor")?.trim().replace(/^@/, "")

    if (rawActor) {
      const collection = url.searchParams.get("collection") || DEFAULT_COLLECTION
      return Response.redirect(new URL(`/${rawActor}/${collection}`, url.origin).href, 302)
    }

    let actor: string
    let collectionId: string

    if (parts.length >= 2) {
      actor = decodeURIComponent(parts[0]).replace(/^@/, "")
      collectionId = decodeURIComponent(parts.slice(1).join("/"))
    } else if (parts.length === 1) {
      actor = decodeURIComponent(parts[0]).replace(/^@/, "")
      collectionId = DEFAULT_COLLECTION
    } else {
      actor = ""
      collectionId = DEFAULT_COLLECTION
    }

    const collection = collectionMap.get(collectionId)
    const collectionLabel = collectionId !== DEFAULT_COLLECTION
      ? ` (${collection?.label || collectionId})`
      : ""

    let html = pageHead(actor ? `@${actor}${esc(collectionLabel)} - at first` : "at first") +
      `<h1>at first</h1>`

    if (actor) {
      try {
        const { did, pds } = await resolveHandle(actor)
        const repoCollections = new Set(await describeRepo(did, pds))

        html += renderForm(actor, collectionId, repoCollections)

        const cacheKey = `${did}/${collectionId}`
        const cached = await env.CACHE.get<RawRecord[]>(cacheKey, "json")
        const records = cached
          ?? (collection?.fetchRecords
            ? await collection.fetchRecords(did, pds, LIMIT)
            : await listRecords(did, pds, collectionId, LIMIT, collection?.reverse))

        if (!cached && records.length >= LIMIT) {
          ctx.waitUntil(env.CACHE.put(cacheKey, JSON.stringify(records)))
        }

        if (!records.length) {
          html += "<p>No records found.</p>"
        } else {
          const viewAll = collection?.viewAll ?? defaultViewAll
          const views = await viewAll(records, actor, pds)
          for (const view of views) html += renderItem(view)
        }
      } catch (err) {
        html += renderForm(actor, collectionId)
        html += `<p class="error">${esc(err instanceof Error ? err.message : "Unknown error")}</p>`
      }
    } else {
      html += renderForm("", collectionId)
    }

    html += "</body></html>"

    return new Response(html, { headers: HTML_HEADERS })
  },
} satisfies ExportedHandler<Env>
