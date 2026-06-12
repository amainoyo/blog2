const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
    const client = await pool.connect();

    try {
        // 替换 posts 表中 content 字段里的 http:// 为 https://
        const result = await client.query(`
            UPDATE posts
            SET content = REPLACE(content, 'http://', 'https://'),
                updated_at = CURRENT_TIMESTAMP
            WHERE content LIKE '%http://%'
        `);

        console.log(`已更新 ${result.rowCount} 篇文章的链接`);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch(console.error);