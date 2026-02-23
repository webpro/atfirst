import { truncateMarkdown, type ItemView } from "../render.ts"
import type { RawRecord } from "../feed.ts"

export const id = "com.whtwnd.blog.entry"
export const label = "Whitewind Blogs"

export function viewAll(records: RawRecord[], actor: string): ItemView[] {
  return records.map(({ uri, value }) => {
    const title = typeof value.title === "string" ? value.title : undefined
    const createdAt = typeof value.createdAt === "string" ? value.createdAt : undefined
    const content = typeof value.content === "string" ? value.content : null
    const rkey = uri.split("/").pop()

    return {
      date: createdAt,
      dateHref: `https://whtwnd.com/${actor}/${rkey}`,
      title,
      body: content ? truncateMarkdown(content, 200) : undefined,
    }
  })
}
