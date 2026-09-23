import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const root = process.cwd()
const settings = JSON.parse(await readFile(join(root, '.apifox/settings.json'), 'utf8'))
const projectId = String(settings.projectId)
const branch = settings.branch ?? 'main'
const now = new Date()
const local = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
const runId = `${local.year}-${local.month}-${local.day}T${local.hour}-${local.minute}-${local.second}`
const snapshotsRoot = join(root, '.apifox/snapshots')
const snapshotDirectory = join(snapshotsRoot, runId)
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'apifox-snapshot-'))
await mkdir(snapshotDirectory, { recursive: true })

const run = (args) => execFileSync('apifox', args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
})
const runJson = (args) => JSON.parse(run(args))
const secretKey = /(?:password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key)/i
const sanitizeString = value => value
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
  .replace(/("(?:password|passwd|secret|tokenId|accessToken|refreshToken|authorization|apiKey)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
const sanitize = (value) => {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return typeof value === 'string' ? sanitizeString(value) : value
  const namedSecret = typeof value.name === 'string' && secretKey.test(value.name)
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if ((secretKey.test(key) || (namedSecret && /^(?:value|currentValue|localValue)$/i.test(key))) && typeof child === 'string') {
      return [key, '[REDACTED]']
    }
    return [key, sanitize(child)]
  }))
}
const writeJson = async (name, value) => writeFile(join(snapshotDirectory, name), `${JSON.stringify(sanitize(value), null, 2)}\n`)
const listArgs = ['--project', projectId, '--branch', branch]

try {
  const project = runJson(['project', 'get', projectId])
  const endpoints = runJson(['endpoint', 'list', ...listArgs, '--page', '1', '--page-size', '500'])
  const environments = runJson(['environment', 'list', ...listArgs])
  const testCases = runJson(['test-case', 'list', ...listArgs, '--page', '1', '--page-size', '500'])
  const testScenarios = runJson(['test-scenario', 'list', ...listArgs])
  const testSuites = runJson(['test-suite', 'list', ...listArgs])

  await writeJson('project-detail.json', project)
  await writeJson('endpoints.raw.json', endpoints)
  await writeJson('environments.raw.json', environments)
  await writeJson('test-cases.raw.json', testCases)
  await writeJson('test-scenarios.raw.json', testScenarios)
  await writeJson('test-suites.raw.json', testSuites)

  const nativeTemporary = join(temporaryDirectory, 'project.apifox.json')
  run(['export', '--project', projectId, '--branch', branch, '--format', 'apifox', '--scope', 'all', '--output', nativeTemporary])
  await writeJson('project.apifox.json', JSON.parse(await readFile(nativeTemporary, 'utf8')))

  const operationKeys = new Set()
  const moduleFiles = []
  for (const module of project.data?.modules ?? []) {
    const temporary = join(temporaryDirectory, `openapi-module-${module.id}.json`)
    run(['export', '--project', projectId, '--branch', branch, '--format', 'openapi', '--oas-version', '3.0', '--module-id', String(module.id), '--include-extension-properties', '--output', temporary])
    const document = JSON.parse(await readFile(temporary, 'utf8'))
    const name = `openapi-module-${module.id}.json`
    await writeJson(name, document)
    moduleFiles.push({ id: module.id, name: module.name, file: name })
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']) {
        if (pathItem[method]) operationKeys.add(`${method.toUpperCase()} ${path}`)
      }
    }
  }

  const endpointItems = (endpoints.data ?? []).map(endpoint => ({
    id: endpoint.id,
    name: endpoint.name,
    method: String(endpoint.method).toUpperCase(),
    path: endpoint.path,
    status: endpoint.status,
    folderId: endpoint.folderId,
  })).sort((a, b) => `${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`))
  const missingFromOpenApi = endpointItems.filter(endpoint => !operationKeys.has(`${endpoint.method} ${endpoint.path}`))
  const mainModule = moduleFiles.find(module => module.id === 8295329) ?? moduleFiles.find(module => module.id !== 8163470) ?? moduleFiles[0]
  const probeEnvironment = (environments.data ?? []).find(environment => environment.id === settings.environmentId)
    ?? (environments.data ?? []).find(environment => environment.name === 'zsm-test')
    ?? (environments.data ?? []).find(environment => Object.keys(environment.baseUrls ?? {}).length)
  const probeBaseUrl = probeEnvironment?.baseUrls?.[mainModule?.id ?? 8295329]
    ?? probeEnvironment?.baseUrls?.[String(mainModule?.id ?? 8295329)]
  let runtimeProbe = { status: 'not-run', reason: 'no environment base URL is configured' }
  if (probeBaseUrl) {
    const probeUrl = new URL('/auth/findData', probeBaseUrl).toString()
    const startedAt = Date.now()
    try {
      const response = await fetch(probeUrl, { signal: AbortSignal.timeout(10_000) })
      runtimeProbe = {
        status: 'completed',
        environmentId: probeEnvironment.id,
        environmentName: probeEnvironment.name,
        url: probeUrl,
        httpStatus: response.status,
        elapsedMs: Date.now() - startedAt,
      }
    } catch (error) {
      runtimeProbe = {
        status: 'failed',
        environmentId: probeEnvironment.id,
        environmentName: probeEnvironment.name,
        url: probeUrl,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      }
    }
  }
  const testTargets = (testCases.data ?? []).length
    ? (testCases.data ?? []).map(item => ({ resource: 'test-case', id: item.id, name: item.name }))
    : (testSuites.data ?? []).length
      ? (testSuites.data ?? []).map(item => ({ resource: 'test-suite', id: item.id, name: item.name }))
      : (testScenarios.data ?? []).map(item => ({ resource: 'test-scenario', id: item.id, name: item.name }))
  const testResults = []
  for (const target of testTargets) {
    const args = [target.resource, 'run', String(target.id), '--project', projectId, '--branch', branch, '--reporters', 'cli', '--color', 'off', '--on-error', 'continue', '--timeout-request', '15000']
    if (settings.environmentId ?? probeEnvironment?.id) args.push('--environment', String(settings.environmentId ?? probeEnvironment.id))
    try {
      run(args)
      testResults.push({ ...target, status: 'passed' })
    } catch (error) {
      const output = [error?.stdout, error?.stderr].filter(Boolean).join('\n')
      testResults.push({ ...target, status: 'failed', output: sanitizeString(output).slice(-4000) })
    }
  }
  const failedTestCount = testResults.filter(result => result.status === 'failed').length
  const execution = {
    strategy: testTargets[0]?.resource ?? 'configured-test-resources-only',
    testCaseCount: testCases.data?.length ?? testCases.meta?.total ?? 0,
    testScenarioCount: testScenarios.data?.length ?? 0,
    testSuiteCount: testSuites.data?.length ?? 0,
    executedCount: testResults.length,
    failedCount: failedTestCount,
    status: testResults.length
      ? failedTestCount ? 'failed' : 'passed'
      : 'not-run: no Apifox test cases, scenarios, or suites are configured',
    note: 'Mutation endpoints are not invoked from generated examples because that could alter real project data.',
    runtimeProbe,
    results: testResults,
  }
  const baseline = {
    schemaVersion: 2,
    projectId: Number(projectId),
    branch,
    capturedAt: now.toISOString(),
    source: `Apifox CLI ${run(['--version']).trim()}`,
    modules: moduleFiles,
    summary: {
      endpointCount: endpointItems.length,
      openApiOperationCount: operationKeys.size,
      missingFromOpenApiCount: missingFromOpenApi.length,
      ...execution,
    },
    missingFromOpenApi,
    endpoints: endpointItems,
  }
  await writeJson('interface-baseline.json', baseline)
  await writeJson('test-run.json', execution)

  const priorDirectories = (await readdir(snapshotsRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name !== runId)
    .map(entry => entry.name)
    .sort()
  const previousRunId = priorDirectories.at(-1) ?? null
  let comparison = null
  if (previousRunId) {
    const comparisonPath = join(snapshotDirectory, 'contract-diff.json')
    execFileSync(process.execPath, [join(root, 'scripts/compare-apifox-contracts.mjs'), join(snapshotsRoot, previousRunId), snapshotDirectory, comparisonPath], {
      cwd: root, stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 50 * 1024 * 1024,
    })
    comparison = JSON.parse(await readFile(comparisonPath, 'utf8'))
  }

  await copyFile(join(snapshotDirectory, 'interface-baseline.json'), join(root, '.apifox/latest-interface-baseline.json'))
  if (mainModule) await copyFile(join(snapshotDirectory, mainModule.file), join(root, '.apifox/latest-openapi.json'))
  await writeFile(join(root, '.apifox/latest-run.json'), `${JSON.stringify({
    runId,
    capturedAt: now.toISOString(),
    snapshotDirectory: relative(root, snapshotDirectory),
    previousRunId,
    summary: baseline.summary,
    contractChanges: comparison?.summary ?? null,
  }, null, 2)}\n`)

  console.log(JSON.stringify({
    runId,
    snapshotDirectory: relative(root, snapshotDirectory),
    previousRunId,
    summary: baseline.summary,
    contractChanges: comparison?.summary ?? null,
  }, null, 2))
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
