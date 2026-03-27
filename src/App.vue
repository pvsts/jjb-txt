<template>
  <div class="container" :class="{ 'dark-mode': isDarkMode }">
    <header class="top-nav">
      <div class="nav-left">
        <h1 class="logo">云剪贴板 (D1)</h1>
        <div class="room-badge" @click="handleShareClick">
          <span class="room-label">房间:</span>
          <span class="room-name">{{ roomId }}</span>
          <span class="copy-icon">📋</span>
        </div>
      </div>
      <div class="nav-right">
        <button @click="toggleHistory" class="icon-btn" title="历史记录">
          <span>📜</span>
        </button>
        <button @click="toggleDarkMode" class="icon-btn" :title="isDarkMode ? '切换亮色模式' : '切换暗黑模式'">
          <span>{{ isDarkMode ? '☀️' : '🌙' }}</span>
        </button>
        <button @click="toggleSettings" class="icon-btn" title="设置">
          <span>⚙️</span>
        </button>
      </div>
    </header>

    <div v-if="showSettings" class="panel-overlay" @click="toggleSettings"></div>

    <aside v-if="showSettings" class="settings-panel animate-slide-in">
      <div class="panel-header">
        <h3>⚙️ 房间设置</h3>
        <button @click="toggleSettings" class="close-btn">✕</button>
      </div>
      <div class="setting-section">
        <h4>📱 分享房间</h4>
        <button @click="handleShareClick" class="btn-primary full-width">
          生成二维码/链接
        </button>
      </div>
    </aside>

    <div v-if="showHistory" class="panel-overlay" @click="toggleHistory"></div>
    <aside v-if="showHistory" class="history-panel animate-slide-in">
      <div class="panel-header">
        <h3>📜 历史记录</h3>
        <button @click="toggleHistory" class="close-btn">✕</button>
      </div>
      <div class="history-content">
        <div v-if="roomHistory.length === 0" class="empty-history">
          <span class="empty-icon">📝</span>
          <p>暂无历史记录</p>
        </div>
        <div v-else class="history-list">
          <div v-for="(room, index) in roomHistory" :key="index" class="history-item" @click="switchRoom(room.name)">
            <div class="history-item-left">
              <span class="history-icon">🏠</span>
              <div class="history-info">
                <span class="history-name">{{ room.name }}</span>
                <span class="history-time">{{ formatHistoryTime(room.timestamp) }}</span>
              </div>
            </div>
            <button @click.stop="removeFromHistory(index)" class="history-delete">×</button>
          </div>
        </div>
      </div>
    </aside>

    <div v-if="showQR" class="modal-overlay" @click="closeQRModal">
      <div class="modal-card animate-in" @click.stop>
        <button @click="closeQRModal" class="modal-close">✕</button>
        <h3>扫码分享</h3>
        <div class="qr-wrapper">
          <qrcode-vue :value="currentUrl" :size="200" level="H" class="qr-code" />
        </div>
        <p class="room-url">{{ currentUrl }}</p>
        <button @click="copyLink" class="btn-primary full-width" style="margin-top: 12px;">
          {{ copySuccess ? '✓ 已复制' : '📋 复制链接' }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在拉取内容...</p>
    </div>

    <main class="main-content">
      <div class="status-bar">
        <div class="status-indicator">
          <span :class="['dot', isReady ? 'online' : 'syncing']"></span>
          <span class="status-label">{{ currentStatus }}</span>
        </div>
        <div class="stats-badge">
          <span>{{ textStats.chars }} 字</span>
          <span class="divider">|</span>
          <span>{{ textStats.lines }} 行</span>
        </div>
      </div>

      <div class="editor-container">
        <textarea
          v-model="textContent"
          @input="handleInput"
          placeholder="在此输入内容，停顿后自动同步到云端..."
          class="main-textarea"
          spellcheck="false"
        ></textarea>
      </div>

      <footer class="footer">
        <p>💡 提示：在 URL 后添加 <code>?room=任意名称</code> 即可切换频道</p>
        <p class="shortcuts-hint">快捷键: Ctrl+S 强制保存 | 自动保存已开启</p>
      </footer>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import QrcodeVue from 'qrcode.vue'

// --- 基础状态 ---
const textContent = ref('')
const currentStatus = ref('正在连接...')
const isReady = ref(false)
const showQR = ref(false)
const showSettings = ref(false)
const showHistory = ref(false)
const copySuccess = ref(false)
const currentUrl = window.location.href
const isLoading = ref(true)
const isDarkMode = ref(false)

const urlParams = new URLSearchParams(window.location.search)
const roomId = urlParams.get('room') || '公共频道'

const roomHistory = ref([])

// 统计
const textStats = computed(() => ({
  chars: textContent.value.length,
  lines: textContent.value.split('\n').length
}))

let syncTimer = null

// --- 核心业务逻辑 (模仿 wx-txt 模式) ---

// 1. 初始化加载
const init = async () => {
  isLoading.value = true
  currentStatus.value = '拉取中...'
  try {
    const res = await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`)
    const result = await res.json()
    
    if (result.data) {
      textContent.value = result.data.content || ''
    }
    isReady.value = true
    currentStatus.value = '就绪'
    saveToHistory()
  } catch (error) {
    currentStatus.value = '连接失败'
  } finally {
    isLoading.value = false
  }
}

// 2. 保存到数据库
const saveToDatabase = async () => {
  currentStatus.value = '同步中...'
  try {
    const res = await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: textContent.value
      })
    })
    if (res.ok) {
      currentStatus.value = '已保存'
      setTimeout(() => { if (currentStatus.value === '已保存') currentStatus.value = '就绪' }, 2000)
    }
  } catch (error) {
    currentStatus.value = '同步失败'
  }
}

// 3. 输入处理（防抖保存）
const handleInput = () => {
  currentStatus.value = '输入中...'
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    saveToDatabase()
  }, 1000) // 停顿1秒后自动保存
}

// --- UI 工具函数 ---

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
  localStorage.setItem('darkMode_jjb', isDarkMode.value)
}

const loadTheme = () => {
  isDarkMode.value = localStorage.getItem('darkMode_jjb') === 'true'
}

const saveToHistory = () => {
  let history = JSON.parse(localStorage.getItem('roomHistory_jjb') || '[]')
  history = history.filter(r => r.name !== roomId)
  history.unshift({ name: roomId, timestamp: Date.now() })
  if (history.length > 10) history.pop()
  roomHistory.value = history
  localStorage.setItem('roomHistory_jjb', JSON.stringify(history))
}

const toggleSettings = () => { showSettings.value = !showSettings.value }
const toggleHistory = () => { showHistory.value = !showHistory.value }
const handleShareClick = () => { showQR.value = true; copyLink() }
const closeQRModal = () => showQR.value = false

const copyLink = () => {
  navigator.clipboard.writeText(currentUrl).then(() => {
    copySuccess.value = true
    setTimeout(() => copySuccess.value = false, 2000)
  })
}

const switchRoom = (name) => {
  window.location.href = `?room=${encodeURIComponent(name)}`
}

const removeFromHistory = (idx) => {
  roomHistory.value.splice(idx, 1)
  localStorage.setItem('roomHistory_jjb', JSON.stringify(roomHistory.value))
}

const formatHistoryTime = (ts) => {
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff/60)}分钟前`
  return new Date(ts).toLocaleDateString()
}

const handleKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveToDatabase()
  }
}

onMounted(() => {
  loadTheme()
  init()
  document.addEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
/* 容器 */
.container {
  min-height: 100vh;
  background-color: #f8f9fa;
  color: #212529;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.container.dark-mode {
  background-color: #1a1a2e;
  color: #e0e0e0;
}

/* 导航栏 */
.top-nav {
  background: white;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  z-index: 100;
}

.dark-mode .top-nav {
  background: #16213e;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.nav-left, .nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(45deg, #4facfe 0%, #00f2fe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.room-badge {
  background: #f1f3f5;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: 0.2s;
}

.dark-mode .room-badge {
  background: #0f3460;
}

.room-badge:hover {
  background: #e9ecef;
}

.icon-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 8px;
  border-radius: 8px;
  transition: 0.2s;
}

.icon-btn:hover {
  background: rgba(0,0,0,0.05);
}

.dark-mode .icon-btn:hover {
  background: rgba(255,255,255,0.1);
}

/* 主内容 */
.main-content {
  flex: 1;
  max-width: 1000px;
  margin: 0 auto;
  width: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  color: #6c757d;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ced4da;
}

.dot.online { background: #40c057; box-shadow: 0 0 8px #40c057; }
.dot.syncing { background: #fab005; }

/* 编辑器 */
.editor-container {
  flex: 1;
  background: white;
  border-radius: 12px;
  border: 1px solid #dee2e6;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}

.dark-mode .editor-container {
  background: #16213e;
  border-color: #0f3460;
}

.main-textarea {
  width: 100%;
  height: 100%;
  min-height: 500px;
  padding: 20px;
  border: none;
  outline: none;
  font-size: 16px;
  line-height: 1.6;
  resize: none;
  background: transparent;
  color: inherit;
  font-family: "Cascadia Code", Consolas, monospace;
}

/* 侧边栏 & 弹窗 */
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 150;
}

.settings-panel, .history-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  background: white;
  z-index: 200;
  padding: 24px;
  box-shadow: -4px 0 12px rgba(0,0,0,0.1);
}

.dark-mode .settings-panel, .dark-mode .history-panel {
  background: #1a1a2e;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #6c757d;
}

/* 按钮 */
.btn-primary {
  background: #4facfe;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.full-width { width: 100%; }

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255,255,255,0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dark-mode .loading-overlay {
  background: rgba(26,26,46,0.8);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4facfe;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 历史记录项 */
.history-item {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 8px;
  transition: 0.2s;
}

.history-item:hover {
  background: #f1f3f5;
}

.dark-mode .history-item:hover {
  background: #16213e;
}

.footer {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #adb5bd;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: white;
  padding: 24px;
  border-radius: 16px;
  text-align: center;
  max-width: 320px;
  width: 90%;
}

.dark-mode .modal-card {
  background: #1a1a2e;
}

.qr-wrapper {
  background: white;
  padding: 12px;
  display: inline-block;
  border-radius: 12px;
  margin: 16px 0;
}

.room-url {
  font-size: 12px;
  word-break: break-all;
  color: #6c757d;
  background: #f8f9fa;
  padding: 8px;
  border-radius: 6px;
}
</style>