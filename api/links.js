// Vercel KV persistent storage
const STORAGE_KEY = 'veribridge_links';

// Helper to get links from KV
async function getLinks() {
    if (process.env.KV_REST_API_URL) {
        // Production: Use Vercel KV
        try {
            const res = await fetch(`${process.env.KV_REST_API_URL}/get/${STORAGE_KEY}`, {
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
            });
            const data = await res.json();
            return data.result ? JSON.parse(data.result) : [];
        } catch (e) {
            console.error('KV get error:', e);
            return [];
        }
    } else {
        // Development: Use global (resets on cold start)
        if (!global.links) {
            global.links = [
                { code: 'demo123', targetUrl: 'https://www.roblox.com/login', createdAt: Date.now(), status: 'active', useCount: 0, createdBy: 'system' }
            ];
        }
        return global.links;
    }
}

// Helper to save links to KV
async function saveLinks(links) {
    if (process.env.KV_REST_API_URL) {
        try {
            await fetch(`${process.env.KV_REST_API_URL}/set/${STORAGE_KEY}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(links)
            });
        } catch (e) {
            console.error('KV set error:', e);
        }
    } else {
        global.links = links;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    // Get current links from storage
    let links = await getLinks();
    
    console.log('[Links API]', req.method, 'Admin:', isAdmin, 'Links count:', links.length);
    
    // ==================== GET ====================
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        if (code) {
            const link = links.find(l => l.code === code && l.status === 'active');
            if (link) { 
                link.useCount = (link.useCount || 0) + 1;
                await saveLinks(links);
                return res.json({ success: true, targetUrl: link.targetUrl }); 
            }
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        if (!isAdmin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.json({ links });
    }
    
    // ==================== POST ====================
    if (req.method === 'POST') {
        const { targetUrl, createdBy = 'public' } = req.body;
        
        if (!targetUrl) {
            return res.status(400).json({ success: false, error: 'URL required' });
        }
        
        const domains = global.domains || ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        const isValid = domains.some(d => targetUrl.toLowerCase().includes(d.toLowerCase()));
        
        if (!isValid) {
            return res.status(400).json({ success: false, error: 'Domain not allowed' });
        }
        
        const code = Math.random().toString(36).substring(2, 10);
        const newLink = { code, targetUrl, createdAt: Date.now(), status: 'active', useCount: 0, createdBy };
        
        links.push(newLink);
        await saveLinks(links);
        
        return res.json({ success: true, code, targetUrl });
    }
    
    // ==================== ADMIN ONLY ====================
    if (!isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const pathParts = req.url.split('/');
    const code = pathParts[pathParts.length - 1].split('?')[0];
    
    // ==================== PATCH ====================
    if (req.method === 'PATCH') {
        const link = links.find(l => l.code === code);
        if (!link) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        const { targetUrl, status } = req.body;
        if (targetUrl !== undefined) link.targetUrl = targetUrl;
        if (status !== undefined) link.status = status;
        
        await saveLinks(links);
        return res.json({ success: true });
    }
    
    // ==================== DELETE ====================
    if (req.method === 'DELETE') {
        const initialLength = links.length;
        links = links.filter(l => l.code !== code);
        
        if (links.length === initialLength) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        await saveLinks(links);
        return res.json({ success: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
