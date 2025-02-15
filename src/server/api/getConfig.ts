// server/api/getConfig.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const configType = query.type === 'cb' ? 'config.yml' : 'config-pub.yml'

  console.log(`API 获取配置文件: ${configType}`)

  try {
    const response = await $fetch(`http://localhost:3000/${configType}`)
    return response
  } catch (e) {
    return { error: '配置文件加载失败' }
  }
})
