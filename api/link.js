export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (!global.links) {
        global.links = [
            { code: 'demo123', targetUrl: 'https://www.roblox.com/login', createdAt: Date.now(), status: 'active', useCount: 0, createdBy: 'system' }
        ];
    }
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const isAdmin = auth === 'admin_session_token' || process.env.ADMIN_TOKEN === auth;
    
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        if (code) {
            const link = global.links.find(l => l.code === code && l.status === 'active');
            if (link) { 
                link.useCount++; 
                return res.json({ success: true, targetUrl: link.targetUrl }); 
            }
            return res.status(404).json({ success: false });
        }
        
        if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
        return res.json({ links: global.links });
    }
    
    if (req.method === 'POST') {
        const { targetUrl } = req.body;
        if (!targetUrl) return res.status(400).json({ error: 'URL required' });
        
        const domains = global.domains || ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        if (!domains.some(d => targetUrl.toLowerCase().includes(d))) {
            return res.status(400).json({ error: 'Domain not allowed' });
        }
        
        const code = Math.random().toString(36).substring(2, 10);
        const link = { 
            code, 
            targetUrl, 
            createdAt: Date.now(), 
            status: 'active', 
            useCount: 0, 
            createdBy: req.body.createdBy || 'public' 
        };
        global.links.push(link);
        return res.json({ success: true, code, targetUrl });
    }
    
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
    
    const code = req.url.split('/').pop();
    
    if (req.method === 'PATCH') {
        const link = global.links.find(l => l.code === code);
        if (link) Object.assign(link, req.body);
        return res.json({ success: true });
    }
    
    if (req.method === 'DELETE') {
        global.links = global.links.filter(l => l.code !== code);
        return res.json({ success: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}