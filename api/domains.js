const STORAGE_KEY = 'veribridge_domains';

async function getDomains() {
    if (process.env.KV_REST_API_URL) {
        try {
            const res = await fetch(`${process.env.KV_REST_API_URL}/get/${STORAGE_KEY}`, {
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
            });
            const data = await res.json();
            return data.result ? JSON.parse(data.result) : ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        } catch (e) {
            return ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        }
    } else {
        if (!global.domains) {
            global.domains = ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        }
        return global.domains;
    }
}

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
        } catch (e) {
            console.error('KV set error:', e);
        }
    } else {
        global.domains = domains;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    let domains = await getDomains();
    
    if (req.method === 'GET') {
        return res.json({ domains });
    }
    
    if (!isAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (req.method === 'POST') {
        const { domain } = req.body;
        if (domain && !domains.includes(domain)) {
            domains.push(domain);
            await saveDomains(domains);
        }
        return res.json({ success: true, domains });
    }
    
    if (req.method === 'DELETE') {
        const { domain } = req.body;
        domains = domains.filter(d => d !== domain);
        await saveDomains(domains);
        return res.json({ success: true, domains });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
