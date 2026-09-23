import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const specPath = join(root, '.apifox/latest-openapi.json')
const spec = JSON.parse(await readFile(specPath, 'utf8'))
const latestRun = JSON.parse(await readFile(join(root, '.apifox/latest-run.json'), 'utf8'))
const testRun = JSON.parse(await readFile(join(root, latestRun.snapshotDirectory, 'test-run.json'), 'utf8'))
const documentedPaths = Object.keys(spec.paths || {})
const sourceFiles = []

const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (['.ts', '.vue'].includes(extname(entry.name))) sourceFiles.push(path)
  }
}

await walk(join(root, 'app'))

const pathPattern = /(['"`])(\/(?:auth|experiment|dashboard|system|collection|visualization|processing|calibration|alarms|satellite-management|agent-registry)[^'"`\s]*)\1/g
const rawPaths = new Map()
let requestCallCount = 0
let combinedSource = ''

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  combinedSource += `\n${source}`
  requestCallCount += [...source.matchAll(/\brequest(?:<[^\n]+>)?\(/g)].length
  for (const match of source.matchAll(pathPattern)) {
    const rawPath = match[2]
    const files = rawPaths.get(rawPath) || new Set()
    files.add(relative(root, file))
    rawPaths.set(rawPath, files)
  }
}

const normalizePath = (rawPath) => rawPath
  .split('?')[0]
  .replace(/\/\$\{[^}]+\}/g, '/:dynamic')
  .replace(/\$\{[^}]+\}/g, '')
  .replace(/\/$/, '') || '/'

const matchesDocumentedPath = (candidate) => documentedPaths.includes(candidate)
  ? candidate
  : documentedPaths.find((path) => {
  const expression = `^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+')}$`
  return new RegExp(expression).test(candidate.replaceAll(':dynamic', 'value'))
  })

const used = []
const external = []
for (const [rawPath, files] of rawPaths) {
  const normalized = normalizePath(rawPath)
  const documented = matchesDocumentedPath(normalized)
  if (documented) used.push({ path: documented, files: [...files].sort() })
  else if (normalized.startsWith('/agent-registry')) external.push({ path: normalized, files: [...files].sort() })
}

const uniqueUsed = [...new Map(used.map(item => [item.path, item])).values()].sort((a, b) => a.path.localeCompare(b.path))
const assertions = [
  ['试验任务使用 taskId 字符串主键', /type ExperimentTaskResponse = \{\s*taskId\?: string/],
  ['采集总览调用 /collection/overview', /request<CollectionOverview>\(`\/collection\/overview/],
  ['采集事件使用 infoTotal 等统计字段', /infoTotal\?: number[\s\S]*criticalTotal\?: number/],
  ['实时遥测请求携带 taskId', /new URLSearchParams\(\{ taskId: taskId\.value \}\)/],
  ['帧异常请求携带 taskId', /processing\/realtime\/invalid\?taskId=/],
  ['处理后数据调用 /processing/processed', /request<ProcessedTelemetryRecord\[]>\(processedPath\(\)\)/],
  ['规则配置只提交 parameterRangeCheckEnabled', /type RuleConfigKey = 'parameterRangeCheckEnabled'/],
  ['参数规则使用 calibrationFormula', /calibrationFormula: String\(row\.calibrationFormula/],
  ['用户保存提交 email', /email: userForm\.email\.trim\(\)/]
].map(([name, pattern]) => ({ name, passed: pattern.test(combinedSource) }))

const forbidden = [
  ['不再把任务编号强制转换为 number', /Number\(taskId\.value\)/],
  ['不再提交文档外的 dedupEnabled', /dedupEnabled/],
  ['不再使用旧校准字段 calibrationChannel', /calibrationChannel/]
].map(([name, pattern]) => ({ name, passed: !pattern.test(combinedSource) }))

const failed = [...assertions, ...forbidden].filter(item => !item.passed)
const report = {
  checkedAt: new Date().toISOString(),
  projectId: 8562488,
  apifoxSnapshot: latestRun.runId,
  openApiOperationCount: Object.values(spec.paths || {}).reduce((count, item) => count + ['get', 'post', 'put', 'patch', 'delete'].filter(method => item[method]).length, 0),
  contractChangesFromPreviousSnapshot: latestRun.contractChanges,
  apifoxTestCaseCount: Number(testRun.testCaseCount || 0),
  liveRequestTestsExecuted: Number(testRun.executedCount || 0),
  liveRequestTestStatus: testRun.status,
  runtimeProbe: testRun.runtimeProbe ?? null,
  webRequestCallCount: requestCallCount,
  documentedPathCount: uniqueUsed.length,
  documentedPaths: uniqueUsed,
  externalOrUndocumentedPaths: external,
  assertions: [...assertions, ...forbidden],
  failedCount: failed.length
}

console.log(JSON.stringify(report, null, 2))
const outputIndex = process.argv.indexOf('--output')
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : ''
if (outputPath) {
  const absoluteOutput = resolve(root, outputPath)
  await mkdir(dirname(absoluteOutput), { recursive: true })
  await writeFile(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`)
}
if (failed.length) process.exit(1)
