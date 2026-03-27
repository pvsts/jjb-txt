export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get('room') || '公共频道';
  const db = env.DB;

  // 1. 获取内容 (GET)
  if (request.method === 'GET') {
    const data = await db.prepare('SELECT * FROM clipboards WHERE id = ?').bind(roomId).first();
    return new Response(JSON.stringify({ data: data || null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 保存内容 (POST)
  if (request.method === 'POST') {
    const { content } = await request.json();
    await db.prepare(`
      INSERT INTO clipboards (id, content, updated_at)
      VALUES (?1, ?2, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
    `).bind(roomId, content).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}