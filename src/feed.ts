export const BSKY_API = "https://public.api.bsky.app/xrpc"

export interface RawRecord {
  uri: string
  value: Record<string, unknown>
}

async function resolvePds(did: string): Promise<string> {
  const plcRes = await fetch(`https://plc.directory/${did}`)
  if (!plcRes.ok) throw new Error("Could not resolve DID")
  const didDoc = (await plcRes.json()) as {
    service: Array<{ id: string; serviceEndpoint: string }>
  }
  const pds = didDoc.service.find((s) => s.id === "#atproto_pds")?.serviceEndpoint
  if (!pds) throw new Error("No PDS found")
  return pds
}

export async function resolveIdentity(actor: string): Promise<{ did: string; pds: string }> {
  if (actor.startsWith("did:")) {
    return { did: actor, pds: await resolvePds(actor) }
  }
  const idRes = await fetch(`${BSKY_API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`)
  if (!idRes.ok) throw new Error("Could not resolve handle")
  const { did } = (await idRes.json()) as { did: string }
  return { did, pds: await resolvePds(did) }
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
