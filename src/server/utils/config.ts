import crypto from 'node:crypto'
import yaml from 'yaml'
import defu from 'defu'
import { ZodError } from 'zod'
import type { CompleteConfig, Service, Tag } from '~/types'
import { configSchema } from '~/server/validations'
import axios from 'axios' // 引入 axios 用于发送 HTTP 请求

type DraftService = Omit<Service, 'id'>

type TagMap = Map<Tag['name'], Tag>

const logger = useLogger('config')

function determineService(items: DraftService[], tags: TagMap): Service[] {
  return items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    tags: (item.tags || []).map((tag): Tag => {
      if (typeof tag === 'string') {
        return tags.get(tag) || {
          name: tag,
          color: 'blue',
        }
      }

      return tag
    }),
  }))
}

export const configFileName = 'config.yml'

export function getDefaultConfig(): CompleteConfig {
  return {
    title: 'Mafl Home Page',
    lang: 'en',
    theme: 'system',
    checkUpdates: true,
    layout: {
      grid: {
        small: 2,
        medium: 2,
        large: 3,
        xlarge: 4,
      },
    },
    behaviour: {
      target: '_blank',
    },
    tags: [],
    services: [],
  }
}

function createTagMap(tags: Tag[]): TagMap {
  return tags.reduce((acc, tag) => {
    acc.set(tag.name, tag)

    return acc
  }, new Map())
}

/**
 * Load config from remote CDN
 */
export async function loadConfig(): Promise<CompleteConfig> {
  const defaultConfig = getDefaultConfig()

  try {

    const baseUrl = 'https://nav.ctext.top'
    let remoteConfigUrl = `${baseUrl}/config-pub.yml`

    console.log("远程配置文件地址: " + remoteConfigUrl)

    // 使用 axios 获取远程 YAML 文件
    const response = await axios.get(remoteConfigUrl)
    console.log("远程配置文件status: " + response.status)

    const raw = response.data
    const config = yaml.parse(raw) || {}

    // 验证配置文件
    configSchema.parse(config)

    // 处理 services
    const services: CompleteConfig['services'] = []
    const tags: TagMap = createTagMap(config.tags || [])

    if (Array.isArray(config.services)) {
      services.push({
        items: determineService(config.services, tags),
      })
    } else {
      const entries = Object.entries<DraftService[]>(config.services || [])

      for (const [title, items] of entries) {
        services.push({
          title,
          items: determineService(items, tags),
        })
      }
    }

    return defu({ ...config, services }, defaultConfig)
  } catch (e) {
    logger.error("远程配置文件获取异常: " + e)
    console.error("远程配置文件获取异常: ", e)

    if (e instanceof Error) {
      defaultConfig.error = e.message
    }

    if (e instanceof ZodError) {
      defaultConfig.error = JSON.stringify(
        e.format(),
        (key, val) => (key === '_errors' && !val.length) ? undefined : val,
        ' ',
      )
    }
  }

  return defaultConfig
}


/**
 * Save config to memory storage
 */
export async function setConfig(config: CompleteConfig): Promise<void> {
  const storage = useStorage('main')

  await storage.setItem('config', config)
  await storage.setItem('services', extractServicesFromConfig(config))

  logger.success('Set "main" config')
}

/**
 * Get config from memory storage
 */
export async function getConfig(): Promise<CompleteConfig | null> {
  const storage = useStorage('main')
  await storage.getKeys()


  return storage.getItem<CompleteConfig>('config')
}

/**
 * Safely retrieves a list of services for frontend.
 * Omit "secrets" fields.
 */
export function extractSafelyConfig(config: CompleteConfig) {
  return JSON.parse(JSON.stringify(
    config, (key, val) => key === 'secrets' ? undefined : val,
  ))
}

/**
 * Create Map services
 */
export function extractServicesFromConfig(config: CompleteConfig): Record<string, Service> {
  return config.services.reduce<Record<string, Service>>((acc, group) => {
    for (const item of group.items) {
      acc[item.id] = item
    }

    return acc
  }, {})
}
