const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'dikilia/veribridge';
const LINKS_PATH = 'data/links.json';
const DOMAINS_PATH = 'data/domains.json';

// Read file from GitHub
async function readFromGitHub(path) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return { content: JSON.parse(content), sha: data.sha };
    } catch (error) {
        console.error('Read error:', error);
        return null;
    }
}

// Write file to GitHub
async function writeToGitHub(path, content, sha = null) {
    try {
        const body = {
            message: `Update ${path}`,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64')
        };
        
        if (sha) {
            body.sha = sha;
        }
        
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GitHub API error: ${error.message}`);
        }
        
        return true;
    } catch (error) {
        console.error('Write error:', error);
        return false;
    }
}

// Read domains from GitHub
async function readDomains() {
    const data = await readFromGitHub(DOMAINS_PATH);
    if (data) {
        return { domains: data.content, sha: data.sha };
    }
    return { domains: ['roblox.com', 'www.roblox.com', 'auth.roblox.com'], sha: null };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Check GitHub token
    if (!GITHUB_TOKEN) {
        console.error('[Links API] GITHUB_TOKEN not configured');
        return res.status(500).json({ error: 'Storage not configured' });
    }
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    // Read current links from GitHub
    let linksData = await readFromGitHub(LINKS_PATH);
    let links = linksData ? linksData.content : [];
    let sha = linksData ? linksData.sha : null;
    
    // Initialize if empty
    if (links.length === 0) {
        links = [{
            code: 'demo123',
            targetUrl: 'https://www.roblox.com/login',
            createdAt: Date.now(),
            status: 'active',
            useCount: 0,
            createdBy: 'system'
        }];
        await writeToGitHub(LINKS_PATH, links, sha);
    }
    
    console.log('[Links API]', req.method, 'Admin:', isAdmin, 'Links:', links.length);
    
    // ==================== GET ====================
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
        if (code) {
            const link = links.find(l => l.code === code && l.status === 'active');
            if (link) { 
                link.useCount = (link.useCount || 0) + 1;
                await writeToGitHub(LINKS_PATH, links, sha);
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
        
        const domainsData = await readDomains();
        const domains = domainsData.domains;
        const isValid = domains.some(d => targetUrl.toLowerCase().includes(d.toLowerCase()));
        if (!isValid) return res.status(400).json({ success: false, error: 'Domain not allowed' });
        
        const code = Math.random().toString(36).substring(2, 10);
        const newLink = { code, targetUrl, createdAt: Date.now(), status: 'active', useCount: 0, createdBy };
        
        links.push(newLink);
        const success = await writeToGitHub(LINKS_PATH, links, sha);
        
        if (success) {
            return res.json({ success: true, code, targetUrl });
        }
        return res.status(500).json({ success: false, error: 'Failed to save' });
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
        
        const success = await writeToGitHub(LINKS_PATH, links, sha);
        if (success) {
            return res.json({ success: true });
        }
        return res.status(500).json({ success: false, error: 'Failed to update' });
    }
    
    // ==================== DELETE ====================
    if (req.method === 'DELETE') {
        const initialLength = links.length;
        links = links.filter(l => l.code !== code);
        
        if (links.length === initialLength) {
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        
        const success = await writeToGitHub(LINKS_PATH, links, sha);
        if (success) {
            return res.json({ success: true });
        }
        return res.status(500).json({ success: false, error: 'Failed to delete' });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
