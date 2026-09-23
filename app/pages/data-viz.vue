<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const realtimeData = ref([
  {
    interfaceName: '遥测 UDP 接口',
    protocol: 'Protobuf',
    type: '实时遥测',
    item: '解析消息体',
    value: '',
    status: '正常'
  }
])
const isRealtimePreviewOpen = ref(false)

const previewRealtimeValue = () => {
  realtimeData.value[0].value = JSON.stringify({
    satelliteId: 'SAT-001',
    roll: Number((Math.random() * 360 - 180).toFixed(2)),
    pitch: Number((Math.random() * 180 - 90).toFixed(2)),
    yaw: Number((Math.random() * 360).toFixed(2)),
    observedAt: new Date().toISOString()
  })
  isRealtimePreviewOpen.value = true
}
</script>

<template>
  <main class="data-viz-page">
    <section class="visualization-toolbar" aria-label="可视化配置操作">
      <UButton type="button" class="toolbar-button">导出配置</UButton>
      <UButton type="button" class="toolbar-button">导入配置</UButton>
      <UButton type="button" class="toolbar-button toolbar-button--primary">+ 新增曲线</UButton>
      <UButton type="button" class="toolbar-button toolbar-button--primary">+ 新增表格</UButton>
    </section>

    <div class="visualization-grid">
      <section class="visualization-panel visualization-panel--primary">
        <header class="panel-header">
          <h2>实时曲线</h2>
          <div class="panel-header-actions">
            <UButton type="button" class="parameter-selector" aria-label="选择设备协议数据">
              <span>选择设备协议数据</span>
              <UIcon name="i-lucide-chevron-down" />
            </UButton>
            <UButton type="button" class="close-button" aria-label="关闭实时曲线">
              <UIcon name="i-lucide-x" />
            </UButton>
          </div>
        </header>
        <div class="empty-chart-state">
          <UIcon name="i-lucide-chart-no-axes-combined" />
          <span>请选择设备协议数据</span>
        </div>
      </section>

      <section class="visualization-panel visualization-panel--primary">
        <header class="panel-header">
          <h2>实时数据</h2>
          <div class="panel-header-actions">
            <UButton type="button" class="parameter-selector" aria-label="选择设备协议数据">
              <span>选择设备协议数据</span>
              <UIcon name="i-lucide-chevron-down" />
            </UButton>
            <UButton type="button" class="close-button" aria-label="关闭实时数据">
              <UIcon name="i-lucide-x" />
            </UButton>
          </div>
        </header>
        <div class="table-wrap">
          <table class="visualization-table">
            <thead>
              <tr>
                <th>采集接口</th>
                <th>协议</th>
                <th>类型</th>
                <th>数据项</th>
                <th>值</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in realtimeData" :key="item.interfaceName">
                <td>{{ item.interfaceName }}</td>
                <td>{{ item.protocol }}</td>
                <td>{{ item.type }}</td>
                <td>{{ item.item }}</td>
                <td>
                  <UPopover v-model:open="isRealtimePreviewOpen" :content="{ side: 'bottom', align: 'start', sideOffset: 8 }">
                    <UButton type="button" class="preview-button" @click.stop="previewRealtimeValue">{{ item.value ? '刷新预览' : '预览' }}</UButton>
                    <template #content>
                      <div class="message-popover">
                        <strong>当前解析消息体</strong>
                        <code class="message-body-value">{{ item.value }}</code>
                      </div>
                    </template>
                  </UPopover>
                </td>
                <td><span class="status-tag">{{ item.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="visualization-panel visualization-panel--secondary">
        <header class="panel-header">
          <h2>实时告警</h2>
          <UButton type="button" class="close-button" aria-label="关闭实时告警">
            <UIcon name="i-lucide-x" />
          </UButton>
        </header>
        <div class="table-wrap">
          <table class="visualization-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>代号</th>
                <th>参数名称</th>
                <th>当前值</th>
                <th>阈值</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="5" class="empty-cell empty-cell--secondary">暂无实时告警</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="visualization-panel visualization-panel--secondary">
        <header class="panel-header">
          <h2>载荷图像</h2>
          <UButton type="button" class="close-button" aria-label="关闭载荷图像">
            <UIcon name="i-lucide-x" />
          </UButton>
        </header>
        <div class="image-panel-content">
          <div class="image-preview-empty">
            <UIcon name="i-lucide-image" />
            <span>点击右侧列表选择图像</span>
          </div>
          <div class="image-table-wrap">
            <table class="visualization-table image-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>卫星</th>
                  <th>波段</th>
                  <th>分辨率</th>
                  <th>大小</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="7" class="empty-cell empty-cell--image">暂无载荷图像</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.data-viz-page {
  display: flex;
  min-width: 0;
  min-height: 100%;
  flex-direction: column;
}

.visualization-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 12px 16px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
}

.toolbar-button {
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text);
  font-size: 13px;
  cursor: pointer;
}

.toolbar-button--primary {
  border-color: var(--ui-primary);
  background: var(--ui-primary);
  color: white;
}

.visualization-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 0;
  flex: 1;
  gap: 12px;
  margin-top: 12px;
}

.visualization-panel {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
}

.visualization-panel::after {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 10px;
  height: 10px;
  content: '';
  opacity: .45;
  background: repeating-linear-gradient(135deg, transparent 0 2px, var(--ui-text-dimmed) 2px 3px);
  clip-path: polygon(100% 0, 100% 100%, 0 100%);
}

.visualization-panel--primary {
  min-height: 420px;
}

.visualization-panel--secondary {
  min-height: 300px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--ui-border);
}

.panel-header h2 {
  margin: 0;
  color: var(--ui-text-highlighted);
  font-size: 15px;
  font-weight: 650;
}

.panel-header-actions {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.parameter-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(320px, 25vw);
  height: 34px;
  gap: 12px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.parameter-selector .i-lucide {
  width: 15px;
  height: 15px;
  flex: none;
}

.close-button {
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.close-button .i-lucide {
  width: 17px;
  height: 17px;
}

.empty-chart-state,
.image-preview-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: var(--ui-text-dimmed);
  font-size: 13px;
}

.empty-chart-state {
  min-height: 360px;
}

.empty-chart-state .i-lucide,
.image-preview-empty .i-lucide {
  width: 42px;
  height: 42px;
  stroke-width: 1.35;
}

.table-wrap,
.image-table-wrap {
  overflow: auto;
}

.visualization-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.visualization-table th,
.visualization-table td {
  height: 44px;
  padding: 9px 13px;
  border-bottom: 1px solid var(--ui-border-muted);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 400;
  text-align: left;
}

.visualization-table th {
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.empty-cell {
  height: 316px !important;
  color: var(--ui-text-dimmed) !important;
  text-align: center !important;
}

.empty-cell--secondary {
  height: 226px !important;
}

.message-body-value {
  display: block;
  overflow-wrap: anywhere;
  color: var(--ui-text-highlighted);
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
}

.message-popover {
  display: grid;
  width: min(500px, calc(100vw - 32px));
  gap: 8px;
  padding: 2px;
}

.message-popover strong {
  color: var(--ui-text-highlighted);
  font-size: 12px;
  font-weight: 600;
}

.preview-button {
  width: fit-content;
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid var(--ui-primary);
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-primary);
  font-size: 11px;
  cursor: pointer;
}

.preview-button:hover {
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
}

.status-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--ui-success) 46%, transparent);
  border-radius: 3px;
  color: var(--ui-success);
  font-size: 11px;
}

.image-panel-content {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(340px, 1.1fr);
  min-width: 0;
  min-height: 240px;
}

.image-table-wrap {
  min-width: 0;
}

.image-preview-empty {
  min-height: 240px;
  border-right: 1px solid var(--ui-border);
}

.image-table {
  min-width: 620px;
}

.empty-cell--image {
  height: 196px !important;
}

@media (max-width: 1200px) {
  .visualization-grid {
    grid-template-columns: 1fr;
  }

  .parameter-selector {
    width: min(380px, 44vw);
  }
}
</style>
