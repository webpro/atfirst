export const BSKY_API = "https://public.api.bsky.app/xrpc"

export interface RawRecord {
  uri: string
  value: Record<string, unknown>
}

export async function resolveHandle(handle: string): Promise<{ did: string; pds: string }> {
  const idRes = await fetch(`${BSKY_API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`)
  if (!idRes.ok) throw new Error("Could not resolve handle")
  const { did } = (await idRes.json()) as { did: string }

  const plcRes = await fetch(`https://plc.directory/${did}`)
  if (!plcRes.ok) throw new Error("Could not resolve DID")
  const didDoc = (await plcRes.json()) as {
    service: Array<{ id: string; serviceEndpoint: string }>
  }
  const pds = didDoc.service.find((s) => s.id === "#atproto_pds")?.serviceEndpoint
  if (!pds) throw new Error("No PDS found")

  return { did, pds }
}

export async function describeRepo(did: string, pds: string): Promise<string[]> {
  const res = await fetch(`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`)
  if (!res.ok) return []
  const data = (await res.json()) as { collections?: string[] }
  return data.collections ?? []
}

export async function listRecords(did: string, pds: string, collection: string, limit = 10, reverse = false): Promise<RawRecord[]> {
  const listUrl =
    `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}` +
    `&collection=${encodeURIComponent(collection)}&limit=${limit}` +
    (reverse ? "&reverse=true" : "")
  const res = await fetch(listUrl)
  if (!res.ok) throw new Error(`PDS error ${res.status}`)
  return ((await res.json()) as { records: RawRecord[] }).records
}
