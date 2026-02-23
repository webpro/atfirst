import { esc, type ItemView } from "../render.ts"
import type { RawRecord } from "../feed.ts"

export const id = "social.psky.feed.post"
export const label = "Picosky Posts"

export function viewAll(records: RawRecord[], _actor: string): ItemView[] {
  return records.map(({ value }) => {
    const text = typeof value.text === "string" ? value.text : ""
    return { body: esc(text) }
  })
}
