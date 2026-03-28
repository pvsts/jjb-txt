export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get("room") || "公共频道";
  const DB = env.DB; // 直接从环境变量获取数据库对象

  // 1. 获取内容 (GET)
  if (request.method === "GET") {
    const result = await DB.prepare("SELECT content FROM clipboard WHERE room_id = ?")
      .bind(roomId).first();
    return Response.json({ data: result || { content: "" } });
  }

  // 2. 自动保存内容 (POST)
  if (request.method === "POST") {
    const { content } = await request.json();
    await DB.prepare(`
      INSERT INTO clipboard (room_id, content) VALUES (?, ?)
      ON CONFLICT(room_id) DO UPDATE SET content = excluded.content
    `).bind(roomId, content).run();
    return Response.json({ success: true });
  }
}