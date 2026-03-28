<template>
  <div class="container" :class="{ 'dark-mode': isDarkMode }">
    <header class="top-nav-container">
      <div class="top-nav">
        <div class="nav-left">
          <h1 class="logo">云剪贴板</h1>
          <div class="room-tag" @click="copyLink">
            <span>{{ roomId }}</span>
            <span class="status-dot" :class="{ 'online': isReady }"></span>
          </div>
        </div>

        <div class="nav-center">
          <transition name="fade">
            <span v-if="expireTime !== 'never'" class="expire-badge">
              ⏱️ {{ getExpireLabel(expireTime) }}后销毁
            </span>
          </transition>
        </div>

        <div class="nav-right">
          <button @click="openHistory" class="icon-btn" title="最近访问">📜</button>
          <button @click="isDarkMode = !isDarkMode" class="icon-btn">{{ isDarkMode ? '☀️' : '🌙' }}</button>
          <button @click="openSettings" class="icon-btn" title="房间设置">⚙️</button>
        </div>
      </div>
    </header>

    <main class="main-content">
      <div class="info-bar">
        <div class="status-group">
          <span class="status-text">{{ currentStatus }}</span>
          <span class="room-tip">（提示：URL后加 ?room=xxx 可跳转房间）</span>
        </div>
        <span class="stats">{{ textStats.chars }} 字 | {{ textStats.lines }} 行</span>
      </div>
      <div class="editor-wrapper">
        <textarea 
          v-model="textContent" 
          @input="handleInput" 
          placeholder="在此输入内容，停顿后自动同步..." 
          class="main-textarea"
        ></textarea>
      </div>
    </main>

    <div v-if="showSettings || showHistory" class="drawer-overlay" @click="closeAllDrawers"></div>

    <aside :class="['drawer', { 'active': showSettings }]">
      <div class="drawer-header">
        <h3>房间设置</h3>
        <button @click="showSettings = false" class="drawer-close-btn">✕</button>
      </div>
      <div class="drawer-body">
        <section class="opt-group">
          <label>🔒 访问密码</label>
          <div class="input-group">
            <input v-model="roomPassword" type="password" placeholder="留空则不设密码" />
            <button @click="saveFullSettings" class="inner-save-btn">保存</button>
          </div>
        </section>

        <section class="opt-group">
          <label>⏰ 自动销毁 (有效期)</label>
          <div class="grid-options">
            <button v-for="opt in expireOptions" :key="opt.val" 
              :class="{ active: expireTime === opt.val }"
              @click="expireTime = opt.val">{{ opt.label }}</button>
          </div>
        </section>

        <section class="opt-group">
          <label>🔗 房间链接</label>
          <button @click="showQR = true" class="btn-full-primary">生成分享二维码</button>
        </section>
      </div>
    </aside>

    <aside :class="['drawer', { 'active': showHistory }]">
      <div class="drawer-header">
        <h3>最近访问</h3>
        <button @click="showHistory = false" class="drawer-close-btn">✕</button>
      </div>
      <div class="drawer-body">
        <div v-if="roomHistory.length === 0" class="empty-tip">暂无访问记录</div>
        <div v-for="(room, idx) in roomHistory" :key="idx" class="history-card" @click="jumpToRoom(room)">
          <span>🏠 {{ room }}</span>
        </div>
      </div>
    </aside>

    <teleport to="body">
      <transition name="fade">
        <div v-if="showQR" class="modal-overlay" @click="showQR = false">
          <div class="modal-card" @click.stop>
            <div class="qr-container">
              <qrcode-vue :value="currentUrl" :size="200" level="H" />
            </div>
            <p class="qr-tip">扫码分享房间：<b>{{ roomId }}</b></p>
            <button @click="showQR = false" class="btn-full-primary" style="margin-top:15px; background:#007bff; color:#fff">关闭</button>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import QrcodeVue from 'qrcode.vue'

const textContent = ref('')
const roomId = new URLSearchParams(window.location.search).get('room') || '公共频道'
const isReady = ref(false)
const currentStatus = ref('连接中...')
const isDarkMode = ref(false)
const showSettings = ref(false)
const showHistory = ref(false)
const showQR = ref(false)
const roomPassword = ref('')
const expireTime = ref('never')
const roomHistory = ref(JSON.parse(localStorage.getItem('room_history') || '[]'))

const expireOptions = [
  { label: '永不', val: 'never' }, { label: '1h', val: '1h' },
  { label: '24h', val: '24h' }, { label: '3d', val: '3d' },
  { label: '7d', val: '7d' }, { label: '1y', val: '1y' }
]

const currentUrl = window.location.href
const textStats = computed(() => ({
  chars: textContent.value.length,
  lines: textContent.value ? textContent.value.split('\n').length : 0
}))

const getExpireLabel = (val) => expireOptions.find(o => o.val === val)?.label || ''
const openHistory = () => { showHistory.value = true; showSettings.value = false; }
const openSettings = () => { showSettings.value = true; showHistory.value = false; }
const closeAllDrawers = () => { 
  showSettings.value = false; 
  showHistory.value = false; 
  showQR.value = false;
}

// ESC 关闭逻辑
const handleEsc = (e) => {
  if (e.key === 'Escape') closeAllDrawers()
}

const init = async () => {
  window.addEventListener('keydown', handleEsc)
  if (!roomHistory.value.includes(roomId)) {
    roomHistory.value.unshift(roomId)
    localStorage.setItem('room_history', JSON.stringify(roomHistory.value.slice(0, 10)))
  }
  try {
    const res = await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`)
    const data = await res.json()
    textContent.value = data.content || ''
    if(data.expireTime) expireTime.value = data.expireTime
    isReady.value = true
    currentStatus.value = '已就绪'
  } catch (e) {
    currentStatus.value = '连接异常'
  }
}

onUnmounted(() => window.removeEventListener('keydown', handleEsc))

let timer = null
const handleInput = () => {
  currentStatus.value = '同步中...'
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`, {
        method: 'POST',
        body: JSON.stringify({ content: textContent.value, expireTime: expireTime.value })
      })
      currentStatus.value = '已同步'
    } catch (e) {
      currentStatus.value = '同步失败'
    }
  }, 800)
}

const saveFullSettings = async () => {
  await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`, {
    method: 'POST',
    body: JSON.stringify({ content: textContent.value, password: roomPassword.value, expireTime: expireTime.value })
  })
  alert('设置已更新')
}

const jumpToRoom = (name) => { window.location.href = `?room=${encodeURIComponent(name)}` }
const copyLink = () => {
  navigator.clipboard.writeText(currentUrl)
  alert('链接已复制')
}

onMounted(init)
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { overflow-x: hidden; width: 100vw; font-family: -apple-system, sans-serif; background: #f8f9fa; }

.container { display: flex; flex-direction: column; height: 100vh; }
.dark-mode { background: #121212; color: #eee; }

/* 导航栏布局调整 */
.top-nav-container { width: 100%; background: #fff; border-bottom: 1px solid #eee; z-index: 10; }
.dark-mode .top-nav-container { background: #1e1e1e; border-bottom: 1px solid #333; }
.top-nav { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; padding: 0 20px; height: 60px; position: relative; }

.nav-left { display: flex; align-items: center; gap: 12px; flex: 1; }
.nav-center { flex: 1; display: flex; justify-content: center; } 
.nav-right { flex: 1; display: flex; justify-content: flex-end; align-items: center; }

.logo { font-size: 18px; color: #007bff; white-space: nowrap; font-weight: bold; }
.expire-badge { background: #fff3e0; color: #e65100; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid #ffe0b2; }
.dark-mode .expire-badge { background: #332b1a; color: #ffb74d; border-color: #4d3d26; }

.room-tag { background: #f1f3f5; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.dark-mode .room-tag { background: #333; }
.status-dot { width: 8px; height: 8px; background: #ccc; border-radius: 50%; }
.status-dot.online { background: #28a745; }

.icon-btn { background: none; border: none; font-size: 20px; cursor: pointer; margin-left: 15px; transition: transform 0.1s; }
.icon-btn:active { transform: scale(0.9); }

/* 编辑区域 */
.main-content { flex: 1; width: 100%; max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; padding: 15px; }
.info-bar { display: flex; justify-content: space-between; font-size: 12px; color: #999; margin-bottom: 10px; }
.room-tip { color: #bbb; margin-left: 10px; }
.editor-wrapper { flex: 1; background: #fff; border-radius: 12px; border: 1px solid #e0e0e0; display: flex; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
.dark-mode .editor-wrapper { background: #1e1e1e; border-color: #333; }
.main-textarea { flex: 1; border: none; outline: none; padding: 20px; font-size: 16px; line-height: 1.6; resize: none; background: transparent; color: inherit; }

/* 侧边栏优化 */
.drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 90; }
.drawer { 
  position: fixed; right: 0; top: 0; bottom: 0; width: 320px; 
  background: #fff; z-index: 100; 
  transform: translateX(100%); 
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
  padding: 30px 20px; box-shadow: -5px 0 25px rgba(0,0,0,0.1);
  will-change: transform;
}
.drawer.active { transform: translateX(0); }
.dark-mode .drawer { background: #1e1e1e; }

.drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
.dark-mode .drawer-header { border-color: #333; }
.drawer-close-btn { background: none; border: none; font-size: 24px; color: #aaa; cursor: pointer; }

.opt-group { margin-bottom: 30px; }
.opt-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #555; }
.dark-mode .opt-group label { color: #aaa; }
.input-group { display: flex; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff; }
.dark-mode .input-group { border-color: #444; background: #252525; }
.input-group input { flex: 1; border: none; padding: 12px; outline: none; background: transparent; color: inherit; }
.inner-save-btn { background: #007bff; color: #fff; border: none; padding: 0 20px; cursor: pointer; }

.grid-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.grid-options button { padding: 10px; font-size: 13px; border: 1px solid #eee; background: #fafafa; border-radius: 8px; cursor: pointer; color: inherit; }
.grid-options button.active { background: #007bff; color: #fff; border-color: #007bff; }
.dark-mode .grid-options button { background: #2d2d2d; border-color: #444; }

.btn-full-primary { width: 100%; background: #f0f7ff; color: #007bff; border: 1px solid #007bff; padding: 14px; border-radius: 10px; cursor: pointer; font-weight: 600; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal-card { background: #fff; padding: 30px; border-radius: 20px; text-align: center; width: 90%; max-width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
.dark-mode .modal-card { background: #1e1e1e; }
.qr-container { background: #fff; padding: 15px; border-radius: 12px; display: inline-block; margin-bottom: 10px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.history-card { padding: 15px; background: #fafafa; border-radius: 10px; margin-bottom: 12px; cursor: pointer; border: 1px solid #eee; transition: background 0.2s; }
.history-card:hover { background: #f0f0f0; }
.dark-mode .history-card { background: #2d2d2d; border-color: #333; }

@media (max-width: 600px) {
  .nav-center { display: none; }
  .drawer { width: 85%; }
}
</style>