export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get('room') || '公共频道';
  const DB = env.DB;

  // 1. 处理 GET 请求（获取内容）
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
      // 如果有密码，这里只返回内容，验证逻辑在前端或单独接口（演示简化版直接返回）
      return new Response(JSON.stringify({ content: data.content, hasPassword: !!data.password }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ content: '' }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 2. 处理 POST 请求（保存内容/设置）
  if (request.method === 'POST') {
    const { content, password, expireTime } = await request.json();
    
    // 计算过期时间
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
      password = CASE WHEN excluded.password IS NOT NULL THEN excluded.password ELSE password END,
      expires_at = CASE WHEN excluded.expires_at IS NOT NULL THEN excluded.expires_at ELSE expires_at END,
      updated_at = CURRENT_TIMESTAMP
    `).bind(roomId, content, password || null, expiresAt).run();

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Method Not Allowed', { status: 405 });
}