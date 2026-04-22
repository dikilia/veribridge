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
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    console.log('[Auth API] Request:', req.method, path);
    
    const settingsData = await getSettings();
    const settings = settingsData.content || { adminPassword: 'admin123', adminToken: 'admin_session_token' };
    const sha = settingsData.sha;
    
    const ADMIN_PASSWORD = settings.adminPassword || 'admin123';
    const SESSION_TOKEN = settings.adminToken || 'admin_session_token';
    const APP_URL = process.env.APP_URL || 'https://veribridge-dashboard.vercel.app';
    
    // ==================== PASSWORD LOGIN ====================
    if (req.method === 'POST' && path.includes('/password')) {
        const { password } = req.body;
        console.log('[Auth API] Password login attempt');
        
        if (password === ADMIN_PASSWORD) {
            console.log('[Auth API] Password login SUCCESS');
            return res.json({ success: true, token: SESSION_TOKEN });
        }
        console.log('[Auth API] Password login FAILED');
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    // ==================== VERIFY TOKEN ====================
    if (req.method === 'GET' && path.includes('/verify')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        console.log('[Auth API] Verify token');
        
        if (auth === SESSION_TOKEN) {
            return res.json({ valid: true, user: 'Admin' });
        }
        return res.json({ valid: false });
    }
    
    // ==================== CHANGE PASSWORD ====================
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
        
        return res.json({ success: true, message: 'Password updated' });
    }
    
    // ==================== GITHUB OAUTH - INITIATE ====================
    if (req.method === 'GET' && path.includes('/github') && !path.includes('/callback')) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const redirectUri = `${APP_URL}/api/auth/github/callback`;
        
        console.log('[Auth API] GitHub OAuth Initiate');
        console.log('[Auth API] Client ID:', clientId ? 'SET' : 'MISSING');
        console.log('[Auth API] Redirect URI:', redirectUri);
        
        if (!clientId) {
            return res.status(500).send('GitHub Client ID not configured. Please add GITHUB_CLIENT_ID to environment variables.');
        }
        
        // Use raw string concatenation to avoid encoding issues
        const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
        
        console.log('[Auth API] Redirecting to:', githubUrl);
        return res.redirect(githubUrl);
    }
    
    // ==================== GITHUB OAUTH - CALLBACK ====================
    if (req.method === 'GET' && path.includes('/github/callback')) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');
        
        console.log('[Auth API] GitHub Callback');
        console.log('[Auth API] Code:', code ? 'RECEIVED' : 'MISSING');
        console.log('[Auth API] Error:', error || 'NONE');
        
        if (error) {
            console.log('[Auth API] GitHub returned error:', error, errorDescription);
            return res.redirect(`${APP_URL}/admin?error=github_denied&reason=${encodeURIComponent(errorDescription || '')}`);
        }
        
        if (!code) {
            console.log('[Auth API] No code provided');
            return res.redirect(`${APP_URL}/admin?error=no_code`);
        }
        
        try {
            // Exchange code for access token
            console.log('[Auth API] Exchanging code for token...');
            
            const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id: process.env.GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code: code,
                    redirect_uri: `${APP_URL}/api/auth/github/callback`
                })
            });
            
            const tokenData = await tokenResponse.json();
            console.log('[Auth API] Token response:', tokenData.error ? 'ERROR: ' + tokenData.error : 'SUCCESS');
            
            if (tokenData.error) {
                return res.redirect(`${APP_URL}/admin?error=token_exchange&reason=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
            }
            
            // Get user info
            console.log('[Auth API] Fetching user info...');
            const userResponse = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'User-Agent': 'VeriBridge'
                }
            });
            
            const userData = await userResponse.json();
            console.log('[Auth API] GitHub user:', userData.login);
            
            // Check allowed users
            const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());
            console.log('[Auth API] Allowed users:', allowedUsers);
            
            if (!allowedUsers.includes(userData.login.toLowerCase())) {
                console.log('[Auth API] User NOT allowed:', userData.login);
                return res.redirect(`${APP_URL}/admin?error=unauthorized_user&user=${userData.login}`);
            }
            
            console.log('[Auth API] User authorized! Redirecting to dashboard...');
            
            // Success - redirect to admin with token
            return res.redirect(`${APP_URL}/admin?token=${SESSION_TOKEN}&user=${userData.login}`);
            
        } catch (err) {
            console.error('[Auth API] GitHub callback error:', err);
            return res.redirect(`${APP_URL}/admin?error=server_error`);
        }
    }
    
    // ==================== 404 ====================
    console.log('[Auth API] Unknown path:', path);
    res.status(404).json({ error: 'Not found' });
}
