export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get('room') || '公共频道';
  const DB = env.DB;

  // 获取前端传来的密码（存放在请求头中比较安全）
  const clientPassword = request.headers.get('x-password');

  // 1. 处理 GET 请求
  if (request.method === 'GET') {
    const data = await DB.prepare(
      'SELECT content, password, expires_at FROM clipboard WHERE room_id = ?'
    ).bind(roomId).first();

    if (data) {
      // 检查是否过期
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        await DB.prepare('DELETE FROM clipboard WHERE room_id = ?').bind(roomId).run();
        return new Response(JSON.stringify({ content: '' }), { headers: { 'Content-Type': 'application/json' } });
      }

      // --- 关键安全逻辑开始 ---
      if (data.password) {
        if (data.password !== clientPassword) {
          // 如果用户传了密码但不匹配，返回 401 状态码
          if (clientPassword) {
            return new Response(JSON.stringify({ wrongPassword: true }), { 
              status: 401, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }
          // 如果用户根本没传密码，返回普通加密提示
          return new Response(JSON.stringify({ needPassword: true }), { 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
      }

      // 验证通过或无密码，返回数据
      return new Response(JSON.stringify({ 
        content: data.content,
        expireTime: data.expires_at ? 'never' : null
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 房间不存在
    return new Response(JSON.stringify({ content: '' }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 2. 处理 POST 请求（保持你的逻辑，增加错误处理）
  if (request.method === 'POST') {
    try {
      const { content, password, expireTime } = await request.json();
      
      let expiresAt = null;
      if (expireTime && expireTime !== 'never') {
        const ms = { '1h': 3600000, '24h': 86400000, '3d': 259200000, '7d': 604800000, '1y': 31536000000 };
        expiresAt = new Date(Date.now() + (ms[expireTime] || 0)).toISOString();
      }

      await DB.prepare(`
        INSERT INTO clipboard (room_id, content, password, expires_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(room_id) DO UPDATE SET
        content = excluded.content,
        password = CASE WHEN excluded.password != '' THEN excluded.password ELSE NULL END,
        expires_at = CASE WHEN excluded.expires_at IS NOT NULL AND excluded.expires_at != '' THEN excluded.expires_at ELSE expires_at END,
        updated_at = CURRENT_TIMESTAMP
      `).bind(roomId, content, password || null, expiresAt).run();

      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
