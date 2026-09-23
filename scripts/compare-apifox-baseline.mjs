import { readFile } from 'node:fs/promises'

const [previousPath, currentPath] = process.argv.slice(2)

if (!previousPath || !currentPath) {
  console.error('Usage: node scripts/compare-apifox-baseline.mjs <previous-baseline.json> <current-baseline.json>')
  process.exit(1)
}

const [previous, current] = await Promise.all(
  [previousPath, currentPath].map(async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))),
)

const byId = (items) => new Map(items.map((item) => [String(item.id), item]))
const previousById = byId(previous.endpoints ?? [])
const currentById = byId(current.endpoints ?? [])
const added = []
const removed = []
const changed = []

for (const [id, endpoint] of currentById) {
  const before = previousById.get(id)
  if (!before) {
    added.push(endpoint)
    continue
  }

  const fields = ['name', 'method', 'path', 'status', 'folderId']
  const differences = fields.filter((field) => before[field] !== endpoint[field])
  if (differences.length) changed.push({ before, after: endpoint, fields: differences })
}

for (const [id, endpoint] of previousById) {
  if (!currentById.has(id)) removed.push(endpoint)
}

console.log(JSON.stringify({
  previousCapturedAt: previous.capturedAt,
  currentCapturedAt: current.capturedAt,
  previousCount: previous.endpoints?.length ?? 0,
  currentCount: current.endpoints?.length ?? 0,
  added,
  removed,
  changed,
}, null, 2))
