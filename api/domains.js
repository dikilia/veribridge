const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'dikilia/veribridge';
const DOMAINS_PATH = 'storage/domains.json';

async function readFromGitHub(path) {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`GitHub API error: ${response.status}`);
        }
        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return { content: JSON.parse(content), sha: data.sha };
    } catch (error) {
        console.error('[GitHub Read] Error:', error);
        return null;
    }
}

async function writeToGitHub(path, content, sha = null) {
    try {
        const body = {
            message: `Update ${path}`,
            content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64')
        };
        if (sha) body.sha = sha;
        
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
        console.error('[GitHub Write] Error:', error);
        return false;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (!GITHUB_TOKEN) {
        console.error('[Domains API] GITHUB_TOKEN not configured');
        return res.status(500).json({ error: 'Storage not configured' });
    }
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    let domainsData = await readFromGitHub(DOMAINS_PATH);
    let domains = domainsData ? domainsData.content : ['roblox.com', 'www.roblox.com', 'auth.roblox.com'];
    let sha = domainsData ? domainsData.sha : null;
    
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
            await writeToGitHub(DOMAINS_PATH, domains, sha);
        }
        return res.json({ success: true, domains });
    }
    
    if (req.method === 'DELETE') {
        const { domain } = req.body;
        domains = domains.filter(d => d !== domain);
        await writeToGitHub(DOMAINS_PATH, domains, sha);
        return res.json({ success: true, domains });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
