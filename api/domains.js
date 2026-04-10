// Vercel KV persistent storage
const STORAGE_KEY = 'veribridge_domains';

// Helper to get domains from KV
async function getDomains() {
    if (process.env.KV_REST_API_URL) {
        try {
            const res = await fetch(`${process.env.KV_REST_API_URL}/get/${STORAGE_KEY}`, {
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
            });
            const data = await res.json();
            return data.result ? JSON.parse(data.result) : ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        } catch (e) {
            console.error('[Domains API] KV get error:', e);
            return ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        }
    } else {
        // Development fallback
        if (!global.domains) {
            global.domains = ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        }
        return global.domains;
    }
}

// Helper to save domains to KV
async function saveDomains(domains) {
    if (process.env.KV_REST_API_URL) {
        try {
            await fetch(`${process.env.KV_REST_API_URL}/set/${STORAGE_KEY}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(domains)
            });
            console.log('[Domains API] Saved domains:', domains);
        } catch (e) {
            console.error('[Domains API] KV set error:', e);
        }
    } else {
        global.domains = domains;
    }
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Auth check
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    console.log('[Domains API]', req.method, 'Admin:', isAdmin);
    
    // Get current domains
    let domains = await getDomains();
    
    // ==================== GET (Public) ====================
    if (req.method === 'GET') {
        return res.json({ domains });
    }
    
    // ==================== POST & DELETE (Admin Only) ====================
    if (!isAdmin) {
        console.log('[Domains API] Unauthorized - token missing or invalid');
        return res.status(401).json({ error: 'Unauthorized - Admin token required' });
    }
    
    // ==================== POST - Add Domain ====================
    if (req.method === 'POST') {
        const { domain } = req.body;
        
        if (!domain) {
            return res.status(400).json({ error: 'Domain required' });
        }
        
        // Clean domain (remove http://, https://, www.)
        let cleanDomain = domain.toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0];
        
        if (!domains.includes(cleanDomain)) {
            domains.push(cleanDomain);
            await saveDomains(domains);
            console.log('[Domains API] Added domain:', cleanDomain);
        }
        
        return res.json({ success: true, domains });
    }
    
    // ==================== DELETE - Remove Domain ====================
    if (req.method === 'DELETE') {
        const { domain } = req.body;
        
        if (!domain) {
            return res.status(400).json({ error: 'Domain required' });
        }
        
        const initialLength = domains.length;
        domains = domains.filter(d => d !== domain);
        
        if (domains.length === initialLength) {
            return res.status(404).json({ error: 'Domain not found' });
        }
        
        await saveDomains(domains);
        console.log('[Domains API] Removed domain:', domain);
        
        return res.json({ success: true, domains });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
