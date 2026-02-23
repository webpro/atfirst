import type { ItemView } from "../render.ts"
import type { RawRecord } from "../feed.ts"

export const id = "fyi.unravel.frontpage.post"
export const label = "Frontpage Links"
export const reverse = true

export function viewAll(records: RawRecord[], actor: string): ItemView[] {
  return records.map(({ uri, value }) => {
    const title = typeof value.title === "string" ? value.title : undefined
    const url = typeof value.url === "string" ? value.url : undefined
    const createdAt = typeof value.createdAt === "string" ? value.createdAt : undefined
    const rkey = uri.split("/").pop()

    let host: string | undefined
    if (url) {
      try { host = new URL(url).hostname } catch { host = url }
    }

    return {
      date: createdAt,
      dateHref: `https://frontpage.fyi/post/${actor}/${rkey}`,
      title,
      titleHref: url,
      meta: host,
    }
  })
}
