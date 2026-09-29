下面这份可以直接发给前端，涵盖最近几次参数导入、PDXP 配置、系统树、遥测筛选、数据查询和批量修改的全部接入变化。
一、参数导入与 PDXP 协议配置
1. 导入参数解析配置
接口：POST /processing/rules/import，请求类型为 multipart/form-data。
参数	类型	说明
taskId	字符串，必填	当前试验任务 ID
type	字符串，必填	1 卫星、2 设备，由前端选择
file	文件，必填	Excel 或制表符 TXT


Excel 的每个 Sheet 对应一个设备卫星，Sheet 名称作为该设备卫星的 code 和 name。TXT 使用文件名作为编码和名称。成功响应的 data 是导入的遥测参数条数。
导入文件中的“所属系统”按 \ 分层，例如 测控系统\姿态控制。没有所属系统的参数直接归在设备卫星下。重新导入同名 Sheet 时，后端沿用原设备卫星 ID；仍存在的遥测代号保留原勾选状态。运行中的采集接口不会因导入立即刷新解析字段，下一次接口同步时才加载新配置。
2. 选择设备卫星
接口：GET /processing/device-satellites?taskId=TASK-001。
可选传 type=1 或 type=2；不传或传空返回全部。每项返回：
{"id":12,"code":"XX12卫星","name":"XX12卫星","type":"1"}
协议配置中的 deviceSatelliteId 使用这里返回的 id。
3. 新增、修改 PDXP 协议配置
接口分别为 POST /collection/protocols/create 和 POST /collection/protocols/update；修改时请求体还需带协议配置的 id。
选择 PDXP 时，protocolType=2，configParams 改为：
{
  "taskId": "TASK-001",
  "configName": "PDXP解析配置",
  "protocolType": 2,
  "dataSourceType": 1,
  "configParams": {
    "deviceSatelliteId": 12,
    "pdxphead": {}
  },
  "enabled": 1
}
**PDXP 不再让前端填写或提交 fields。**后端按 deviceSatelliteId 加载该设备的参数解析配置作为解析字段；pdxphead 保留。RPC 协议配置原有的 fields 用法不变。
二、参数配置页面
4. 所属系统树保留
接口：GET /processing/systems?taskId=TASK-001&deviceSatelliteId=12。
这个接口保留，用于参数配置页面。它一次返回指定设备卫星下全部有效的所属系统树，不返回其他设备，也不包含遥测参数。节点包含：
{
  "id": 21,
  "systemName": "测控系统",
  "parentId": 0,
  "sortOrder": 1,
  "children": [
    {
      "id": 22,
      "systemName": "姿态控制",
      "parentId": 21,
      "sortOrder": 2
    }
  ]
}
没有子系统的节点不带 children。
5. 分页查询参数
接口：
GET /processing/rules?taskId=TASK-001&deviceSatelliteId=12&systemId=21&pageNum=1&pageSize=20
taskId、deviceSatelliteId 必填；systemId 可选。不传 systemId 返回该设备下所有有效参数；传入后返回该系统及其下级系统的参数。结果为 data.pageNum、pageSize、total、records。参数记录中包含 id、deviceSatelliteId、systemId、systemName 以及导入的各业务字段，可以直接用于回填编辑表单。pageSize 最大为 200。
6. 批量修改参数
新增接口：POST /processing/rules/batch-update，请求类型为 application/json。
根对象传 taskId 和 items；一次传 1–200 条。每个 item 是一条参数的完整编辑结果，不同条目可填写不同值，也可以属于同一任务下的不同设备。示例：
{
  "taskId": "TASK-001",
  "items": [
    {
      "id": 81,
      "deviceSatelliteId": 12,
      "systemId": 22,
      "tableIndex": "1",
      "bitWidth": "32",
      "telemetryName": "电压",
      "telemetryCode": "TMK1001",
      "formulaType": "300",
      "formulaDesc": "y=a*x+b",
      "processParam": "0.02/1",
      "decimalPlaces": "2",
      "alarmFlag": "1",
      "normalValue": "加电:[41,43]",
      "warningValue": null,
      "stateChangeInfo": null,
      "commandCode": null,
      "controlChannel": null,
      "mergeChannelCount": null,
      "delayChannel": null,
      "storeFlag": "1",
      "calibrationFormula": null
    }
  ]
}
前端需要注意：
- id 是参数解析配置 ID；deviceSatelliteId 是该参数原属设备 ID，不能借修改接口把参数移到另一设备。
- tableIndex、bitWidth、telemetryName、telemetryCode、formulaType 必填。大表序号和遥测代号可以修改，但在同一设备内不能重复。
- systemId 传系统树节点的 id；传 null 表示参数直属设备。不要提交 systemName，后端会根据 systemId 生成完整路径。
- alarmFlag、storeFlag 使用字符串 "0" 或 "1"；空值按 "0" 保存。
- 其他可空字段传 null 表示清空。因为这是完整更新，前端应先用列表记录回填，再提交该条所有可编辑字段，不要只提交变化的几个字段。
- 不提交 isDeleted、createTime、updateTime。
成功响应示例：
{"code":200,"message":"操作成功","data":1}
data 是实际修改条数。任意一条校验失败，整批都不会保存。如果修改了遥测代号，原勾选状态会迁移到新代号；历史 IoTDB 数据不会改名。运行中的 PDXP 解析快照在下次采集接口同步时更新。
三、遥测参数筛选框
7. 按层展开或按代号搜索
接口：GET /processing/telemetry-filter-tree。不传分页参数，返回结果也不带 children。
请求参数	data 的内容
只传 taskId	当前任务的设备卫星节点
taskId + deviceSatelliteId	设备直属参数和根系统节点
taskId + deviceSatelliteId + systemId	系统直属参数和下级系统节点
taskId + telemetryCode	当前任务中代号以该值开头的所有匹配参数


搜索时不能同时传 deviceSatelliteId 或 systemId。没有所属系统的参数直接显示在设备下面，并排在系统节点前。只有 nodeType=parameter、selectable=true 的节点可勾选。
按代号搜索的结果示例：
{
  "code": 200,
  "message": "操作成功",
  "data": [
    {
      "id": 81,
      "label": "电压/TMK1001",
      "nodeType": "parameter",
      "nodeTypeName": "遥测参数",
      "selectable": true,
      "checked": true,
      "hasChildren": false,
      "deviceSatelliteId": 12,
      "deviceSatelliteName": "XX12卫星",
      "systemName": "测控系统\\姿态控制"
    }
  ]
}
搜索结果的 systemName 是完整所属系统路径；未分类参数不返回该字段。这里参数节点的 id 是参数解析配置 ID，checked 是已保存的勾选状态。无匹配项时 data 为 []。
8. 勾选立即保存
接口：POST /processing/telemetry-filter-selection/update。
每勾选或取消一个参数，就提交一次：
{"taskId":"TASK-001","parseRuleId":81,"checked":true}
parseRuleId 取参数节点的 id。勾选状态按任务保存，不与登录用户绑定；再次进入页面查询筛选树时，参数节点的 checked 会返回已保存状态。
四、处理后数据与曲线
9. 查询各已选参数的最新值
接口：GET /processing/processed?taskId=TASK-001。
只传 taskId；设备 ID、遥测代号由已保存的勾选记录自动取得，不传分页参数。后端分别查询每个已勾选参数最新的一条，列表每项包含：
{
  "deviceSatelliteId": 12,
  "telemetryCode": "TMK1001",
  "parameter": "电压",
  "parameterValue": 42.5,
  "status": "加电",
  "processTime": "2026-09-28T09:30:00"
}
参数已勾选但尚无历史数据时，仍返回设备 ID、代号和参数名称，数值、状态、时间为空。
10. 查询各已选参数的曲线
接口：GET /processing/processed/curve?taskId=TASK-001。
也只传 taskId。每个已勾选参数返回最近最多 120 个原始点，不限制时间范围，不传分页参数：
{
  "deviceSatelliteId": 12,
  "telemetryCode": "TMK1001",
  "parameter": "电压",
  "times": [1790568600000, 1790568601000],
  "values": [42.3, 42.5]
}
times 是按时间升序排列的 Unix 毫秒时间戳，与 values 按下标一一对应；每个参数有自己的时间轴。