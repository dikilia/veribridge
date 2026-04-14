const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'dikilia/veribridge';
const LINKS_PATH = 'storage/links.json';
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

async function readDomains() {
    const data = await readFromGitHub(DOMAINS_PATH);
    if (data) return { domains: data.content, sha: data.sha };
    return { domains: ['roblox.com', 'www.roblox.com', 'auth.roblox.com'], sha: null };
}

async function getGeoLocation(ip) {
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { country: 'Local', city: 'Development', flag: '🏠', countryCode: 'LOCAL' };
    }
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,timezone`);
        const data = await response.json();
        if (data.status === 'success') {
            return {
                country: data.country,
                countryCode: data.countryCode,
                city: data.city,
                timezone: data.timezone,
                flag: getCountryFlag(data.countryCode)
            };
        }
    } catch (error) {}
    return { country: 'Unknown', city: 'Unknown', flag: '🌐', countryCode: 'UN' };
}

function getCountryFlag(countryCode) {
    if (!countryCode) return '🌐';
    const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    if (!GITHUB_TOKEN) {
        console.error('[Links API] GITHUB_TOKEN not configured');
        return res.status(500).json({ error: 'Storage not configured' });
    }
    
    const auth = req.headers.authorization?.replace('Bearer ', '');
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const isAdmin = auth === ADMIN_TOKEN;
    
    let linksData = await readFromGitHub(LINKS_PATH);
    let links = linksData ? linksData.content : [];
    let sha = linksData ? linksData.sha : null;
    
    if (links.length === 0) {
        links = [{ code: 'demo123', targetUrl: 'https://www.roblox.com/login', createdAt: Date.now(), status: 'active', useCount: 0, createdBy: 'system', clicks: [] }];
        await writeToGitHub(LINKS_PATH, links, sha);
    }
    
    if (req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        if (code) {
            const link = links.find(l => l.code === code && l.status === 'active');
            if (link) {
                const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
                const geo = await getGeoLocation(clientIp);
                if (!link.clicks) link.clicks = [];
                link.clicks.push({ timestamp: Date.now(), ip: clientIp, country: geo.country, city: geo.city, flag: geo.flag, countryCode: geo.countryCode });
                link.useCount = (link.useCount || 0) + 1;
                await writeToGitHub(LINKS_PATH, links, sha);
                return res.json({ success: true, targetUrl: link.targetUrl });
            }
            return res.status(404).json({ success: false, error: 'Link not found' });
        }
        if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
        return res.json({ links });
    }
    
    if (req.method === 'POST') {
        const { targetUrl, createdBy = 'public' } = req.body;
        if (!targetUrl) return res.status(400).json({ success: false, error: 'URL required' });
        const domainsData = await readDomains();
        const domains = domainsData.domains;
        if (!domains.some(d => targetUrl.toLowerCase().includes(d.toLowerCase()))) {
            return res.status(400).json({ success: false, error: 'Domain not allowed' });
        }
        const code = Math.random().toString(36).substring(2, 10);
        const newLink = { code, targetUrl, createdAt: Date.now(), status: 'active', useCount: 0, createdBy, clicks: [] };
        links.push(newLink);
        const success = await writeToGitHub(LINKS_PATH, links, sha);
        if (success) return res.json({ success: true, code, targetUrl });
        return res.status(500).json({ success: false, error: 'Failed to save' });
    }
    
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
    const pathParts = req.url.split('/');
    const code = pathParts[pathParts.length - 1].split('?')[0];
    
    if (req.method === 'PATCH') {
        const link = links.find(l => l.code === code);
        if (!link) return res.status(404).json({ success: false, error: 'Link not found' });
        const { targetUrl, status } = req.body;
        if (targetUrl !== undefined) link.targetUrl = targetUrl;
        if (status !== undefined) link.status = status;
        const success = await writeToGitHub(LINKS_PATH, links, sha);
        if (success) return res.json({ success: true });
        return res.status(500).json({ success: false, error: 'Failed to update' });
    }
    
    if (req.method === 'DELETE') {
        const initialLength = links.length;
        links = links.filter(l => l.code !== code);
        if (links.length === initialLength) return res.status(404).json({ success: false, error: 'Link not found' });
        const success = await writeToGitHub(LINKS_PATH, links, sha);
        if (success) return res.json({ success: true });
        return res.status(500).json({ success: false, error: 'Failed to delete' });
    }
    
    res.status(405).json({ error: 'Method not allowed' });
}
