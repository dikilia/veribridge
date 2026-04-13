import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'links.json');
const DOMAINS_FILE = path.join(process.cwd(), 'data', 'domains.json');

function initializeStorage() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = [
            {
                code: 'demo123',
                targetUrl: 'https://www.roblox.com/login',
                createdAt: Date.now(),
                status: 'active',
                useCount: 0,
                createdBy: 'system'
            }
        ];
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
}

function readLinks() {
    try {
        initializeStorage();
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('[Links API] Read error:', error);
        return [];
    }
}

function writeLinks(links) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
        return true;
    } catch (error) {
        console.error('[Links API] Write error:', error);
        return false;
    }
}

function readDomains() {
    try {
        if (fs.existsSync(DOMAINS_FILE)) {
            return JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
        }
    } catch (e) {}
    return ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    let links = readLinks();
    
    console.log('[Links API]', req.method, 'Admin:', isAdmin, 'Links:', links.length);
    
    // ==================== GET ====================
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        if (code) {
            const link = links.find(l => l.code === code && l.status === 'active');
            if (link) { 
                link.useCount = (link.useCount || 0) + 1;
                writeLinks(links);
                return res.json({ success: true, targetUrl: link.targetUrl }); 
            }
            return res.status(404).json({ success: false, error: 'Link not found or inactive' });
        }
        
        if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
        return res.json({ links });
    }
    
    // ==================== POST ====================
    if (req.method === 'POST') {
        const { targetUrl, createdBy = 'public' } = req.body;
        if (!targetUrl) return res.status(400).json({ success: false, error: 'URL required' });
        
        const domains = readDomains();
        const isValid = domains.some(d => targetUrl.toLowerCase().includes(d.toLowerCase()));
        if (!isValid) return res.status(400).json({ success: false, error: 'Domain not allowed' });
        
        const code = Math.random().toString(36).substring(2, 10);
        const newLink = { code, targetUrl, createdAt: Date.now(), status: 'active', useCount: 0, createdBy };
        links.push(newLink);
        writeLinks(links);
        return res.json({ success: true, code, targetUrl });
    }
    
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
    
    const pathParts = req.url.split('/');
    const code = pathParts[pathParts.length - 1].split('?')[0];
    
    // ==================== PATCH ====================
    if (req.method === 'PATCH') {
        const link = links.find(l => l.code === code);
        if (!link) return res.status(404).json({ success: false, error: 'Link not found' });
        
        const { targetUrl, status } = req.body;
        if (targetUrl !== undefined) link.targetUrl = targetUrl;
        if (status !== undefined) link.status = status;
        writeLinks(links);
        return res.json({ success: true });
    }
    
    // ==================== DELETE ====================
    if (req.method === 'DELETE') {
        const initialLength = links.length;
        links = links.filter(l => l.code !== code);
        if (links.length === initialLength) return res.status(404).json({ success: false, error: 'Link not found' });
        writeLinks(links);
        return res.json({ success: true });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
