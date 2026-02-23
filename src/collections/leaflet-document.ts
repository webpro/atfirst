import { esc, truncateText, type ItemView } from "../render.ts"
import type { RawRecord } from "../feed.ts"

export const id = "pub.leaflet.document"
export const label = "Leaflet Documents"
export const reverse = true

interface Block {
  block?: { $type?: string; plaintext?: string }
}

interface Page {
  blocks?: Block[]
}

function extractText(pages: unknown): string {
  if (!Array.isArray(pages)) return ""
  const lines: string[] = []
  for (const page of pages as Page[]) {
    for (const b of page.blocks ?? []) {
      const text = b.block?.plaintext
      if (typeof text === "string" && text) lines.push(text)
    }
  }
  return lines.join("\n\n")
}

async function fetchBasePaths(records: RawRecord[], pds: string): Promise<Map<string, string>> {
  const pubUris = new Set<string>()
  for (const { value } of records) {
    if (typeof value.publication === "string") pubUris.add(value.publication)
  }

  const basePathMap = new Map<string, string>()
  for (const uri of pubUris) {
    const parts = uri.replace("at://", "").split("/")
    const repo = parts[0]
    const collection = parts[1]
    const rkey = parts[2]
    const url = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const data = (await res.json()) as { value?: { base_path?: string } }
      if (data.value?.base_path) basePathMap.set(uri, data.value.base_path)
    } catch { /* skip */ }
  }
  return basePathMap
}

export async function viewAll(records: RawRecord[], _actor: string, pds: string): Promise<ItemView[]> {
  const basePaths = await fetchBasePaths(records, pds)

  return records.map(({ uri, value }) => {
    const title = typeof value.title === "string" ? value.title : undefined
    const publishedAt = typeof value.publishedAt === "string" ? value.publishedAt : undefined
    const rkey = uri.split("/").pop()!
    const text = extractText(value.pages)
    const basePath = typeof value.publication === "string" ? basePaths.get(value.publication) : undefined
    const href = basePath ? `https://${basePath}/${rkey}` : undefined

    return {
      date: publishedAt,
      dateHref: href,
      title,
      body: text ? esc(truncateText(text, 200)) : undefined,
    }
  })
}
