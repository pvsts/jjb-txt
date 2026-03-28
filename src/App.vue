<template>
  <div class="container" :class="{ 'dark-mode': isDarkMode }">
    <header class="top-nav-wrapper">
      <div class="top-nav">
        <div class="nav-section left">
          <span class="logo">云剪贴板</span>
          <div class="room-pill" @click="copyLink">
            <span class="room-name">{{ roomId }}</span>
            <span class="dot" :class="{ 'online': isReady }"></span>
          </div>
        </div>

        <div class="nav-section center">
          <transition name="fade">
            <div v-if="expireTime !== 'never'" class="expire-tag">
              ⏱️ {{ getExpireLabel(expireTime) }}后销毁
            </div>
          </transition>
        </div>

        <div class="nav-section right">
          <button @click="openHistory" class="btn-icon">📜</button>
          <button @click="isDarkMode = !isDarkMode" class="btn-icon">{{ isDarkMode ? '☀️' : '🌙' }}</button>
          <button @click="openSettings" class="btn-icon">⚙️</button>
        </div>
      </div>
    </header>

    <main class="content-area">
      <div class="status-bar">
        <div class="status-left">
          <span :class="['status-msg', syncStatusClass]">{{ currentStatus }}</span>
          <span class="hint">URL后加 ?room=xxx 可跳转</span>
        </div>
        <div class="status-right">{{ textStats.chars }} 字 | {{ textStats.lines }} 行</div>
      </div>

      <div class="editor-box">
        <textarea 
          v-model="textContent" 
          @input="handleInput" 
          :disabled="!isReady"
          placeholder="在此输入内容，停顿后自动同步到云端..." 
          spellcheck="false"
        ></textarea>
      </div>
    </main>

    <div v-if="showSettings || showHistory" class="mask" @click="closeAll"></div>
    
    <aside :class="['side-drawer', { 'show': showSettings }]">
      <div class="drawer-head">
        <h3>房间设置</h3>
        <button @click="showSettings = false">✕</button>
      </div>
      <div class="drawer-content">
        <div class="field">
          <label>🔒 房间管理密码 (设置后他人需密码访问)</label>
          <div class="input-btn-group">
            <input v-model="roomPassword" type="password" placeholder="留空则取消密码" />
            <button @click="saveSettings">保存</button>
          </div>
        </div>
        <div class="field">
          <label>⏰ 自动销毁 (有效期)</label>
          <div class="opt-grid">
            <button v-for="opt in expireOptions" :key="opt.val" 
              :class="{ active: expireTime === opt.val }"
              @click="expireTime = opt.val">{{ opt.label }}</button>
          </div>
        </div>
        <div class="field">
          <label>🔗 分享链接</label>
          <button @click="showQR = true" class="primary-btn">生成分享二维码</button>
        </div>
      </div>
    </aside>

    <aside :class="['side-drawer', { 'show': showHistory }]">
      <div class="drawer-head">
        <h3>最近访问</h3>
        <button @click="showHistory = false">✕</button>
      </div>
      <div class="drawer-content">
        <div v-if="!roomHistory.length" class="empty">暂无记录</div>
        <div v-for="r in roomHistory" :key="r" class="history-item" @click="jumpRoom(r)">
          🏠 {{ r }}
        </div>
      </div>
    </aside>

    <teleport to="body">
      <div v-if="showQR" class="modal" @click="showQR = false">
        <div class="modal-body" @click.stop>
          <div class="qr-wrap"><qrcode-vue :value="currentUrl" :size="180" level="H" /></div>
          <p>扫码进入房间: {{ roomId }}</p>
          <button @click="showQR = false">关闭</button>
        </div>
      </div>
    </teleport>

<teleport to="body">
  <div v-if="needPasswordAuth" class="modal auth-modal">
    <div class="modal-body auth-card" @click.stop>
      <div class="auth-icon">🔒</div>
      <h3>此房间已加密</h3>
      <p>请输入访问密码以查看内容</p>
      
      <input 
        v-model="roomPassword" 
        type="password" 
        placeholder="访问密码" 
        class="auth-input"
        :disabled="currentStatus === '正在加载...'"
        @keyup.enter="fetchData" 
      />

      <button 
        @click="fetchData" 
        class="primary-btn" 
        :disabled="currentStatus === '正在加载...'"
      >
        {{ currentStatus === '正在加载...' ? '验证中...' : '验证并进入' }}
      </button>

      <p class="auth-footer" @click="jumpRoom('公共频道')">返回公共频道</p>
    </div>
  </div>
</teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import QrcodeVue from 'qrcode.vue'

// 状态变量
const roomId = new URLSearchParams(window.location.search).get('room') || '公共频道'
const textContent = ref('')
const isReady = ref(false)
const currentStatus = ref('正在连接...')
const isDarkMode = ref(false)
const showSettings = ref(false)
const showHistory = ref(false)
const showQR = ref(false)
const needPasswordAuth = ref(false) // 是否需要输入密码

const roomPassword = ref(localStorage.getItem(`pw_${roomId}`) || '')
const expireTime = ref('never')
const roomHistory = ref(JSON.parse(localStorage.getItem('jjb_history') || '[]'))

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

const syncStatusClass = computed(() => {
  if (currentStatus.value === '已同步' || currentStatus.value === '已就绪') return 'status-success'
  if (currentStatus.value === '同步失败' || currentStatus.value === '连接异常' || currentStatus.value.includes('加密')) return 'status-error'
  return ''
})

const getExpireLabel = (val) => expireOptions.find(o => o.val === val)?.label || ''

const closeAll = () => { showSettings.value = false; showHistory.value = false; }
const openSettings = () => { showSettings.value = true; showHistory.value = false; }
const openHistory = () => { showHistory.value = true; showSettings.value = false; }

// 获取数据逻辑
const fetchData = async () => {
  if (!roomId) return;
  
  try {
    currentStatus.value = '正在加载...';
    // 请求时带上密码 Header
    const res = await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`, {
      headers: { 'x-password': roomPassword.value }
    });
    
    // 情况 A：后端返回 401，代表明确的密码错误
    if (res.status === 401) {
      alert('❌ 密码错误，请重新输入');
      roomPassword.value = ''; // 清空错误密码
      needPasswordAuth.value = true;
      isReady.value = false;
      currentStatus.value = '密码错误';
      return;
    }

    if (!res.ok) throw new Error();
    const data = await res.json();

    // 情况 B：后端逻辑返回 needPassword 标志（第一次进入房间）
    if (data.needPassword) {
      // 如果此时用户已经输入了密码却还返回 needPassword，说明密码不对
      if (roomPassword.value) {
        alert('❌ 密码错误，请重新输入');
        roomPassword.value = '';
      }
      needPasswordAuth.value = true;
      isReady.value = false;
      currentStatus.value = '房间已加密';
      return;
    }

    // 情况 C：验证成功或无密码
    textContent.value = data.content || '';
    if (data.expireTime) expireTime.value = data.expireTime;
    
    needPasswordAuth.value = false; // 关闭弹窗
    isReady.value = true;
    currentStatus.value = '已就绪';
    
    // 验证成功后，持久化存储该房间的密码
    if (roomPassword.value) {
      localStorage.setItem(`pw_${roomId}`, roomPassword.value);
    }
  } catch (e) {
    currentStatus.value = '连接异常';
    console.error(e);
  }
};

// 保存逻辑
let saveTimer = null
const handleInput = () => {
  if (!isReady.value) return
  currentStatus.value = '同步中...'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: textContent.value, 
          expireTime: expireTime.value 
        })
      })
      if (res.ok) currentStatus.value = '已同步'
      else throw new Error()
    } catch (e) {
      currentStatus.value = '同步失败'
    }
  }, 800)
}

const saveSettings = async () => {
  try {
    const res = await fetch(`/api/clipboard?room=${encodeURIComponent(roomId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: textContent.value, 
        password: roomPassword.value, 
        expireTime: expireTime.value 
      })
    })
    if (res.ok) {
      localStorage.setItem(`pw_${roomId}`, roomPassword.value)
      alert('房间设置已更新')
      fetchData() // 刷新状态
    }
  } catch (e) {
    alert('保存失败')
  }
}

const jumpRoom = (r) => { window.location.href = `?room=${encodeURIComponent(r)}` }
const copyLink = () => {
  navigator.clipboard.writeText(currentUrl)
  alert('房间链接已复制')
}

onMounted(() => {
  fetchData()
  if (!roomHistory.value.includes(roomId)) {
    roomHistory.value.unshift(roomId)
    localStorage.setItem('jjb_history', JSON.stringify(roomHistory.value.slice(0, 10)))
  }
})
</script>

<style>
:root { --bg: #f5f7f9; --card: #ffffff; --text: #333; --primary: #007bff; --border: #eee; }
.dark-mode { --bg: #121212; --card: #1e1e1e; --text: #ddd; --border: #333; }

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); overflow: hidden; }

/* 导航栏锁定 */
.top-nav-wrapper { background: var(--card); border-bottom: 1px solid var(--border); height: 60px; width: 100%; position: relative; z-index: 100; }
.top-nav { max-width: 1000px; margin: 0 auto; height: 100%; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; position: relative; }

.nav-section { display: flex; align-items: center; }
.nav-section.left { gap: 10px; flex: 1; min-width: 0; }
.nav-section.center { position: absolute; left: 50%; transform: translateX(-50%); pointer-events: none; }
.nav-section.right { flex: 1; justify-content: flex-end; }

.logo { font-weight: bold; color: var(--primary); white-space: nowrap; font-size: 16px; }
.room-pill { background: var(--bg); padding: 4px 10px; border-radius: 20px; font-size: 12px; display: flex; align-items: center; gap: 6px; cursor: pointer; border: 1px solid var(--border); max-width: 120px; }
.room-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 7px; height: 7px; background: #ccc; border-radius: 50%; }
.dot.online { background: #28a745; box-shadow: 0 0 5px rgba(40,167,69,0.5); }

.expire-tag { background: #fff3e0; color: #e65100; padding: 4px 12px; border-radius: 20px; font-size: 12px; white-space: nowrap; border: 1px solid #ffe0b2; }
.dark-mode .expire-tag { background: #332b1a; color: #ffb74d; border-color: #4d3d26; }

.btn-icon { background: none; border: none; font-size: 18px; cursor: pointer; padding: 8px; margin-left: 5px; border-radius: 8px; transition: background 0.2s; }
.btn-icon:hover { background: var(--bg); }

/* 主体区域 */
.content-area { max-width: 1000px; margin: 0 auto; height: calc(100vh - 60px); display: flex; flex-direction: column; padding: 15px; }

.status-bar { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #999; margin-bottom: 8px; height: 20px; }
.status-left { display: flex; align-items: center; gap: 10px; }
.status-msg.status-success { color: #28a745; }
.status-msg.status-error { color: #dc3545; }
.hint { opacity: 0.5; }

.editor-box { flex: 1; background: var(--card); border-radius: 12px; border: 1px solid var(--border); overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
textarea { width: 100%; height: 100%; border: none; outline: none; padding: 20px; font-size: 16px; line-height: 1.6; resize: none; background: transparent; color: inherit; font-family: inherit; }

/* 侧边栏 */
.mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 200; backdrop-filter: blur(2px); }
.side-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 300px; background: var(--card); z-index: 300; transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); padding: 20px; }
.side-drawer.show { transform: translateX(0); }

.drawer-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.drawer-head button { background: none; border: none; font-size: 20px; color: #999; cursor: pointer; }

.field { margin-bottom: 25px; }
.field label { display: block; font-size: 13px; margin-bottom: 8px; font-weight: bold; opacity: 0.8; }
.input-btn-group { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.input-btn-group input { flex: 1; padding: 10px; border: none; outline: none; background: transparent; color: inherit; }
.input-btn-group button { background: var(--primary); color: #fff; border: none; padding: 0 15px; cursor: pointer; }

.opt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.opt-grid button { padding: 8px; border: 1px solid var(--border); background: var(--bg); border-radius: 6px; cursor: pointer; font-size: 12px; color: inherit; }
.opt-grid button.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.primary-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }

/* 弹窗 */
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-body { background: var(--card); padding: 25px; border-radius: 20px; text-align: center; }
.qr-wrap { background: #fff; padding: 10px; border-radius: 10px; margin-bottom: 15px; display: inline-block; }
.modal-body button { margin-top: 15px; width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); cursor: pointer; background: var(--bg); color: inherit; }

.history-item { padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 10px; cursor: pointer; font-size: 14px; }
.history-item:hover { background: var(--bg); }

/* 移动端适配：隐藏部分文字 */
@media (max-width: 600px) {
  .logo { display: none; }
  .hint { display: none; }
  .nav-section.center { position: static; transform: none; left: auto; flex: 1; justify-content: center; }
  .side-drawer { width: 85%; }
  .status-right { font-size: 10px; }
}
</style>
