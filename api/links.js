export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Initialize links if not exists
    if (!global.links) {
        global.links = [
            { 
                code: 'demo123', 
                targetUrl: 'https://www.roblox.com/login', 
                createdAt: Date.now(), 
                status: 'active', 
                useCount: 0, 
                createdBy: 'system' 
            }
        ];
    }
    
    // Auth check
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    console.log('[Links API]', req.method, 'Admin:', isAdmin, 'Auth:', auth ? 'present' : 'missing');
    
    // ==================== GET ====================
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        // Public: Get single link by code
        if (code) {
            const link = global.links.find(l => l.code === code && l.status === 'active');
            if (link) { 
                link.useCount = (link.useCount || 0) + 1; 
                return res.json({ success: true, targetUrl: link.targetUrl }); 
            }
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        // Admin: Get all links
        if (!isAdmin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.json({ links: global.links });
    }
    
    // ==================== POST (Create Link) ====================
    if (req.method === 'POST') {
        const { targetUrl, createdBy = 'public' } = req.body;
        
        if (!targetUrl) {
            return res.status(400).json({ success: false, error: 'URL required' });
        }
        
        // Validate domain
        const domains = global.domains || ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        const isValid = domains.some(d => targetUrl.toLowerCase().includes(d.toLowerCase()));
        
        if (!isValid) {
            return res.status(400).json({ success: false, error: 'Domain not allowed' });
        }
        
        const code = Math.random().toString(36).substring(2, 10);
        const newLink = {
            code,
            targetUrl,
            createdAt: Date.now(),
            status: 'active',
            useCount: 0,
            createdBy
        };
        
        global.links.push(newLink);
        console.log('[Links API] Created link:', code);
        
        return res.json({ success: true, code, targetUrl });
    }
    
    // ==================== PATCH & DELETE (Admin Only) ====================
    if (!isAdmin) {
        return res.status(401).json({ error: 'Unauthorized - Admin token required' });
    }
    
    // Extract code from URL path
    const pathParts = req.url.split('/');
    const code = pathParts[pathParts.length - 1].split('?')[0];
    
    console.log('[Links API] Operating on code:', code);
    
    // ==================== PATCH ====================
    if (req.method === 'PATCH') {
        const link = global.links.find(l => l.code === code);
        
        if (!link) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        const { targetUrl, status } = req.body;
        
        if (targetUrl !== undefined) link.targetUrl = targetUrl;
        if (status !== undefined) link.status = status;
        
        console.log('[Links API] Updated link:', code, { targetUrl, status });
        
        return res.json({ success: true });
    }
    
    // ==================== DELETE ====================
    if (req.method === 'DELETE') {
        const initialLength = global.links.length;
        global.links = global.links.filter(l => l.code !== code);
        
        if (global.links.length === initialLength) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        console.log('[Links API] Deleted link:', code);
        
        return res.json({ success: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
