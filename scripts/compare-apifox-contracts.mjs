import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

const [previousDirectory, currentDirectory, outputPath] = process.argv.slice(2)

if (!previousDirectory || !currentDirectory) {
  console.error('Usage: node scripts/compare-apifox-contracts.mjs <previous-snapshot-dir> <current-snapshot-dir> [output.json]')
  process.exit(1)
}

const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
const ignoredKeys = new Set(['example', 'examples', 'x-run-in-apifox'])
const isIgnoredKey = key => ignoredKeys.has(key) || key.startsWith('x-apifox')

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isIgnoredKey(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => [key, stable(child)]))
}

const loadContracts = async (directory) => {
  const files = (await readdir(directory)).filter(name => /^openapi-module-.*\.json$/.test(name)).sort()
  const operations = new Map()
  const schemas = new Map()

  for (const file of files) {
    const document = JSON.parse(await readFile(join(directory, file), 'utf8'))
    const moduleId = file.match(/openapi-module-(.+)\.json/)?.[1] ?? file
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of methods) {
        if (!pathItem[method]) continue
        operations.set(`${method.toUpperCase()} ${path}`, stable({
          moduleId,
          summary: pathItem[method].summary,
          description: pathItem[method].description,
          deprecated: pathItem[method].deprecated,
          parameters: [...(pathItem.parameters ?? []), ...(pathItem[method].parameters ?? [])],
          requestBody: pathItem[method].requestBody,
          responses: pathItem[method].responses,
          security: pathItem[method].security,
        }))
      }
    }
    for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
      schemas.set(`${moduleId}:${name}`, stable(schema))
    }
  }
  return { files, operations, schemas }
}

const differences = (before, after, path = '$', result = []) => {
  if (Object.is(before, after)) return result
  if (before === undefined || after === undefined || before === null || after === null || typeof before !== 'object' || typeof after !== 'object') {
    result.push({ path, before, after })
    return result
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) result.push({ path, before, after })
    return result
  }
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    differences(before[key], after[key], `${path}.${key}`, result)
  }
  return result
}

const compareMaps = (previous, current) => {
  const added = []
  const removed = []
  const changed = []
  for (const [key, value] of current) {
    if (!previous.has(key)) added.push({ key, value })
    else {
      const changes = differences(previous.get(key), value)
      if (changes.length) changed.push({ key, differences: changes })
    }
  }
  for (const [key, value] of previous) {
    if (!current.has(key)) removed.push({ key, value })
  }
  return { added, removed, changed }
}

const previous = await loadContracts(previousDirectory)
const current = await loadContracts(currentDirectory)
const operationChanges = compareMaps(previous.operations, current.operations)
const schemaChanges = compareMaps(previous.schemas, current.schemas)
const report = {
  comparedAt: new Date().toISOString(),
  previousSnapshot: basename(previousDirectory),
  currentSnapshot: basename(currentDirectory),
  summary: {
    previousOperationCount: previous.operations.size,
    currentOperationCount: current.operations.size,
    addedOperations: operationChanges.added.length,
    removedOperations: operationChanges.removed.length,
    changedOperations: operationChanges.changed.length,
    addedSchemas: schemaChanges.added.length,
    removedSchemas: schemaChanges.removed.length,
    changedSchemas: schemaChanges.changed.length,
  },
  operations: operationChanges,
  schemas: schemaChanges,
}

const serialized = `${JSON.stringify(report, null, 2)}\n`
if (outputPath) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(outputPath, serialized)
}
console.log(serialized)
