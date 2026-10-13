import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request as ExpressReq, Response as ExpressRes } from 'express';
import { ensureSchema } from './shared/schema.js';
import * as middleware from './functions/_middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database setup: Cloudflare D1 compatibility on Node.js SQLite
class Stmt {
  db: DatabaseSync;
  sql: string;
  args: any[];

  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...a: any[]) {
    const s = new Stmt(this.db, this.sql);
    s.args = a;
    return s;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.args) || null;
  }

  async run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}

export function createD1(dbPath = path.resolve(__dirname, 'tato.sqlite')) {
  const db = new DatabaseSync(dbPath);
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    exec: (sql: string) => db.exec(sql),
    async batch(stmts: any[]) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

async function startServer() {
  const d1 = createD1();

  // Initialize schema
  try {
    const schemaFile = path.resolve(__dirname, 'database_schema_d1.sql');
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, 'utf-8');
      d1.raw.exec(sql);
    }
  } catch (e) {
    console.warn('Schema init note:', e);
  }

  // Ensure products table has needed columns
  try {
    const pCols = (d1.raw.prepare('PRAGMA table_info(products)').all() as any[]).map((c) => c.name);
    if (!pCols.includes('price')) d1.raw.exec('ALTER TABLE products ADD COLUMN price REAL;');
    if (!pCols.includes('currency')) d1.raw.exec('ALTER TABLE products ADD COLUMN currency TEXT;');
    if (!pCols.includes('status')) d1.raw.exec('ALTER TABLE products ADD COLUMN status TEXT;');
    if (!pCols.includes('slug')) d1.raw.exec('ALTER TABLE products ADD COLUMN slug TEXT;');
    if (!pCols.includes('category')) d1.raw.exec('ALTER TABLE products ADD COLUMN category TEXT;');
    if (!pCols.includes('description')) d1.raw.exec('ALTER TABLE products ADD COLUMN description TEXT;');
    if (!pCols.includes('cost_price')) d1.raw.exec('ALTER TABLE products ADD COLUMN cost_price REAL;');
    if (!pCols.includes('sale_price')) d1.raw.exec('ALTER TABLE products ADD COLUMN sale_price REAL;');
    if (!pCols.includes('active')) d1.raw.exec('ALTER TABLE products ADD COLUMN active INTEGER DEFAULT 1;');
  } catch (_) {}

  // Run schema upgrades
  await ensureSchema(d1);

  // Seed initial products if table is empty
  try {
    const count = d1.raw.prepare('SELECT COUNT(*) as n FROM products').get() as any;
    if (!count || count.n === 0) {
      d1.raw.exec(`
        INSERT OR IGNORE INTO products (id, name, origin, roast_level, cost_price, sale_price, active, currency, status, price)
        VALUES ('e71d46e6-8f1d-4c3d-aedc-8461d79f13c0', 'TATO Coffee Doi Wiang Pa', 'Doi Wiang Pa, Chiang Mai', 'all', 280, 650, 1, 'THB', 'active', 650);
        INSERT OR IGNORE INTO products (id, name, price, currency, status, active)
        VALUES ('p1', 'TATO Coffee', 550, 'THB', 'active', 1);
      `);
    }
  } catch (_) {}

  // Set default admin password if not configured
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
  const env: Record<string, any> = {
    ...process.env,
    DB: d1,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  };

  // Pre-load all Cloudflare Pages API functions
  const apiHandlers = new Map<string, any>();
  const apiDir = path.resolve(__dirname, 'functions/api');
  if (fs.existsSync(apiDir)) {
    const files = fs.readdirSync(apiDir).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const routeName = file.replace(/\.js$/, '');
      const mod = await import(`./functions/api/${file}`);
      apiHandlers.set(routeName, mod);
    }
  }

  const app = express();

  // Support raw body for /api/* to pass directly to Web standard Request
  app.use('/api', express.raw({ type: '*/*', limit: '10mb' }));

  // Route /api/* requests through functions/_middleware.js and handler
  app.use('/api', async (req: ExpressReq, res: ExpressRes) => {
    const routeName = req.path.replace(/^\//, '').split('/')[0].split('?')[0];
    const handler = apiHandlers.get(routeName);

    if (!handler) {
      res.status(404).json({ success: false, error: 'Endpoint not found' });
      return;
    }

    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, val);
        }
      }
    }

    let body: any = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        body = req.body;
      }
    }

    const webReq = new Request(fullUrl, {
      method: req.method,
      headers,
      body,
    });

    const context = {
      request: webReq,
      env,
      next: async () => {
        const method = req.method.toUpperCase();
        let fn: any;
        if (method === 'GET') fn = handler.onRequestGet || handler.onRequest;
        else if (method === 'POST') fn = handler.onRequestPost || handler.onRequest;
        else if (method === 'DELETE') fn = handler.onRequestDelete || handler.onRequest;
        else if (method === 'PATCH') fn = handler.onRequestPatch || handler.onRequest;
        else fn = handler.onRequest;

        if (!fn) {
          return new Response(JSON.stringify({ success: false, error: `Method ${method} not allowed` }), {
            status: 405,
            headers: { 'content-type': 'application/json' },
          });
        }

        return fn(context);
      },
    };

    try {
      const webRes: Response = await middleware.onRequest(context);

      res.status(webRes.status);
      webRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const ab = await webRes.arrayBuffer();
      res.send(Buffer.from(ab));
    } catch (err: any) {
      console.error(`API Error on ${req.originalUrl}:`, err);
      res.status(500).json({ success: false, error: err?.message || 'Internal Server Error' });
    }
  });

  // Serve static files from public folder
  app.use(express.static(path.resolve(__dirname, 'public')));

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
