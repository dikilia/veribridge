import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const DATA_FILE = path.join(STORAGE_DIR, 'domains.json');

function initializeStorage() {
    if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        const initialDomains = ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialDomains, null, 2));
    }
}

function readDomains() {
    try {
        initializeStorage();
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
    }
}

function writeDomains(domains) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(domains, null, 2));
        return true;
    } catch (error) {
        return false;
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
    
    let domains = readDomains();
    
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
            writeDomains(domains);
        }
        return res.json({ success: true, domains });
    }
    
    if (req.method === 'DELETE') {
        const { domain } = req.body;
        domains = domains.filter(d => d !== domain);
        writeDomains(domains);
        return res.json({ success: true, domains });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
