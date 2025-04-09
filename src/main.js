import '@/assets/main.scss'
import 'vant/es/toast/style'
import 'vant/lib/index.css'
import 'lib-flexible'
import 'animate.css'
import BreathingColors from 'vue-breathing-colors'
import { createApp } from 'vue'
import _ from 'lodash'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router/index'
import { setupI18n } from './plugin/i18n/index'
import * as publicFun from '@/utils/public'
import { useTradeStore } from '@/store/trade/index'
import { useMainStore } from '@/store/index.js'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { _initCoinWebSocket } from '@/plugin/socket/index.js'
import { initSwitchWalletEvent } from './plugin/chain'
import { storageDict } from './config/dict'
import { setToastDefaultOptions, showDialog, showToast } from 'vant'
// 加载主题
import { initTheme, switchPlanform } from './utils/index'

// 启动调试模式，显示更多日志
console.log('应用开始初始化...')

// 添加全局错误处理
window.onerror = function(message, source, lineno, colno, error) {
  console.error('全局错误捕获:', message, '来源:', source, '行号:', lineno, error)
  return false
}

// 处理Promise中未捕获的错误
window.addEventListener('unhandledrejection', event => {
  console.error('未处理的Promise拒绝:', event.reason)
})

try {
  initTheme()
  console.log('主题初始化完成')
} catch (err) {
  console.error('主题初始化失败:', err)
}

/**
 * 切换平台 pc、h5
 */
try {
  switchPlanform(true)
  console.log('平台切换初始化完成')
  window.addEventListener(
    'resize',
    _.debounce(function () {
      switchPlanform()
    }, 150)
  )
} catch (err) {
  console.error('平台切换初始化失败:', err)
}

// 设置默认参数
setToastDefaultOptions({ duration: 1500 })
setToastDefaultOptions('loading', { forbidClick: true })

/**
 * 初始化socket
 */
try {
  _initCoinWebSocket()
  console.log('WebSocket初始化完成')
} catch (err) {
  console.error('WebSocket初始化失败:', err)
}

const app = createApp(App)
console.log('Vue应用创建完成')

// 捕获Vue应用级别的错误
app.config.errorHandler = (err, vm, info) => {
  console.error('Vue错误:', err)
  console.error('错误信息:', info)
}

// 状态管理
const pinia = createPinia()
// 持久化
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
app.use(router)
app.use(BreathingColors)
console.log('插件注册完成')

// 获取币种列表
const tradeStore = useTradeStore()
const mainStore = useMainStore()

// 尝试从localStorage读取数据作为备份
try {
  const cachedConfig = localStorage.getItem('platformConfig')
  if (cachedConfig) {
    console.log('发现缓存的平台配置')
  }
} catch (err) {
  console.error('读取缓存配置失败:', err)
}

console.log('开始加载关键数据...')

// 获取平台地址 获取平台配置 币种列表 语言列表
Promise.all([
  mainStore.getPlatFormConfig().catch(err => {
    console.error('获取平台配置失败:', err)
    return null
  }),
  mainStore.getSettingConfig().catch(err => {
    console.error('获取设置配置失败:', err)
    return null
  }),
  tradeStore.getCoinList().catch(err => {
    console.error('获取币种列表失败:', err)
    return null
  }),
  // mainStore.getLanguageList()
])
.then(async (results) => {
  console.log('关键数据加载结果:', results.map(r => r !== null))
  
  try {
    const currentLanguage = mainStore.languageList.filter((item) => item.isDefault === 'Y')
    // 判断语言列表中是否存在缓存语言 若不存在 使用默认语言
    let defaultLanguage = mainStore.language || ''
    if (!defaultLanguage && currentLanguage.length) {
      defaultLanguage = currentLanguage[0].dictValue
    }
    console.log('使用语言:', defaultLanguage)
    
    const i18n = await setupI18n(defaultLanguage)
    app.use(i18n)
    
    console.log('准备挂载应用...')
    app.mount('#app')
    console.log('应用挂载完成')
    
    // 显示提示，表明应用已加载
    showToast('应用加载完成')
    
    // 触发应用初始化成功事件
    window.dispatchEvent(new Event('app-initialized'))
  } catch (err) {
    console.error('应用挂载过程中发生错误:', err)
    // 触发应用初始化失败事件
    const event = new CustomEvent('app-init-failed', { detail: '应用挂载失败: ' + (err.message || '未知错误') })
    window.dispatchEvent(event)
    
    // 在页面上显示错误信息
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h2>应用加载失败</h2>
        <p>请检查控制台获取详细错误信息</p>
        <button onclick="location.reload()">刷新页面</button>
      </div>
    `
  }
})
.catch(error => {
  console.error('加载关键数据失败:', error)
  
  // 触发应用初始化失败事件
  const event = new CustomEvent('app-init-failed', { detail: '加载关键数据失败: ' + (error.message || '网络异常') })
  window.dispatchEvent(event)
  
  // 在页面上显示错误信息
  document.body.innerHTML = `
    <div style="padding: 20px; text-align: center;">
      <h2>应用加载失败</h2>
      <p>无法加载必要数据，请检查网络连接或API状态</p>
      <button onclick="location.reload()">刷新页面</button>
    </div>
  `
})

// 页面公共函数
for (const key in publicFun) {
  if (Object.hasOwnProperty.call(publicFun, key)) {
    const elem = publicFun[key]
    app.config.globalProperties[key] = elem
  }
}

// 钱包监听
try {
  initSwitchWalletEvent()
  console.log('钱包监听初始化完成')
} catch (err) {
  console.error('钱包监听初始化失败:', err)
}

// 禁止双指缩放的 JavaScript 代码
document.documentElement.addEventListener(
  'touchstart',
  function (event) {
    if (event.touches.length > 1) {
      event.preventDefault()
    }
  },
  { passive: false }
)

if (process.env.NODE_ENV == 'production ') {
  // 阻止上下文菜单（右键单击）的显示
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault()
  })

  // 阻止某些键盘组合键（Ctrl/Command 键）的默认行为
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
    }
  })
}

// 阻止在触摸设备上进行双击缩放
document.addEventListener('touchstart', function (event) {
  if (event.touches.length > 1) {
    event.preventDefault()
  }
})

// 阻止手势事件的默认行为（例如，捏合缩放）
document.addEventListener('gesturestart', function (event) {
  event.preventDefault()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState == 'hidden') {
    //页面隐藏
    localStorage.setItem(storageDict.CLOSE_WINDOW_TIME, +new Date())
  } else {
    // 页面显示
    let visibleTime = +new Date()
    let hiddenTime = localStorage.getItem(storageDict.CLOSE_WINDOW_TIME) || visibleTime
    //页面再次可见时间-隐藏时间>60s,重连 >5min,刷新页面
    let diffTime = (visibleTime - hiddenTime) / 1000
    console.log('页面再次可见时间', diffTime)
    if (diffTime > 5 * 60) {
      setTimeout(() => location.reload(), 10)
    }
  }
})

router.afterEach(() => {
  document.title = 'ICLEI'
})