const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'dikilia/veribridge';
const SETTINGS_PATH = 'storage/settings.json';

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

async function getSettings() {
    if (!GITHUB_TOKEN) {
        return { adminPassword: 'admin123', adminToken: 'admin_session_token' };
    }
    const data = await readFromGitHub(SETTINGS_PATH);
    if (data) return data;
    return { content: { adminPassword: 'admin123', adminToken: 'admin_session_token' }, sha: null };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    const settingsData = await getSettings();
    const settings = settingsData.content || { adminPassword: 'admin123', adminToken: 'admin_session_token' };
    const sha = settingsData.sha;
    
    const ADMIN_PASSWORD = settings.adminPassword || 'admin123';
    const SESSION_TOKEN = settings.adminToken || 'admin_session_token';
    const APP_URL = process.env.APP_URL || 'https://veribridge-dashboard.vercel.app';
    
    // Password login
    if (req.method === 'POST' && path.includes('/password')) {
        const { password } = req.body;
        if (password === ADMIN_PASSWORD) {
            return res.json({ success: true, token: SESSION_TOKEN });
        }
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    // Verify token
    if (req.method === 'GET' && path.includes('/verify')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth === SESSION_TOKEN) {
            return res.json({ valid: true, user: 'Admin' });
        }
        return res.json({ valid: false });
    }
    
    // Change password - NOW WORKS PERMANENTLY
    if (req.method === 'PUT' && path.includes('/password')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth !== SESSION_TOKEN) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { password: newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }
        
        settings.adminPassword = newPassword;
        
        if (GITHUB_TOKEN) {
            const success = await writeToGitHub(SETTINGS_PATH, settings, sha);
            if (success) {
                return res.json({ success: true, message: 'Password updated permanently' });
            }
            return res.status(500).json({ error: 'Failed to save to storage' });
        }
        
        return res.json({ success: true, message: 'Password updated (temporary - add GITHUB_TOKEN for permanent)' });
    }
    
    // GitHub OAuth - Initiate
    if (req.method === 'GET' && path.includes('/github') && !path.includes('/callback')) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) return res.status(500).send('GitHub Client ID not configured');
        const redirectUri = `${APP_URL}/api/auth/github/callback`;
        const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
        return res.redirect(githubUrl);
    }
    
    // GitHub OAuth - Callback
    if (req.method === 'GET' && path.includes('/github/callback')) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) return res.redirect(`${APP_URL}/admin?error=github_denied`);
        if (!code) return res.redirect(`${APP_URL}/admin?error=no_code`);
        
        try {
            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: process.env.GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code: code,
                    redirect_uri: `${APP_URL}/api/auth/github/callback`
                })
            });
            const tokenData = await tokenRes.json();
            if (tokenData.error) return res.redirect(`${APP_URL}/admin?error=token_exchange`);
            
            const userRes = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'User-Agent': 'VeriBridge' }
            });
            const userData = await userRes.json();
            
            const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());
            if (!allowedUsers.includes(userData.login.toLowerCase())) {
                return res.redirect(`${APP_URL}/admin?error=unauthorized_user`);
            }
            
            return res.redirect(`${APP_URL}/admin?token=${SESSION_TOKEN}&user=${userData.login}`);
        } catch (err) {
            return res.redirect(`${APP_URL}/admin?error=server_error`);
        }
    }
    
    res.status(404).json({ error: 'Not found' });
}
