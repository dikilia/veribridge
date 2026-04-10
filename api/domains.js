export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Default allowed domains
    if (!global.domains) {
        global.domains = ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
    }
    
    // GET - Public can read domains
    if (req.method === 'GET') {
        return res.json({ domains: global.domains });
    }
    
    // POST/DELETE require auth
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const isAdmin = auth === process.env.ADMIN_TOKEN || auth === 'admin_session_token';
    
    if (!isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (req.method === 'POST') {
        const { domain } = req.body;
        if (domain && !global.domains.includes(domain)) {
            global.domains.push(domain);
        }
        return res.json({ success: true, domains: global.domains });
    }
    
    if (req.method === 'DELETE') {
        const { domain } = req.body;
        global.domains = global.domains.filter(d => d !== domain);
        return res.json({ success: true, domains: global.domains });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
