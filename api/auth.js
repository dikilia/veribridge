export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    console.log('[Auth API]', req.method, path);
    
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    const SESSION_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    const APP_URL = process.env.APP_URL || 'https://veribridge-dashboard.vercel.app';
    
    // ==================== PASSWORD LOGIN ====================
    if (req.method === 'POST' && path.includes('/password')) {
        const { password } = req.body;
        
        if (password === ADMIN_PASSWORD) {
            return res.json({ success: true, token: SESSION_TOKEN });
        }
        
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    // ==================== VERIFY TOKEN ====================
    if (req.method === 'GET' && path.includes('/verify')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        
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
        
        return res.json({ success: true });
    }
    
    // ==================== GITHUB OAUTH - INITIATE ====================
    if (req.method === 'GET' && path.includes('/github') && !path.includes('/callback')) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const redirectUri = `${APP_URL}/api/auth/github/callback`;
        
        if (!clientId) {
            return res.status(500).send('GitHub Client ID not configured');
        }
        
        const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
        
        return res.redirect(githubUrl);
    }
    
    // ==================== GITHUB OAUTH - CALLBACK ====================
    if (req.method === 'GET' && path.includes('/github/callback')) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        
        if (error) {
            return res.redirect(`${APP_URL}/admin?error=github_denied`);
        }
        
        if (!code) {
            return res.redirect(`${APP_URL}/admin?error=no_code`);
        }
        
        try {
            // Exchange code for access token
            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
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
            
            const tokenData = await tokenRes.json();
            
            if (tokenData.error) {
                console.error('[Auth API] Token error:', tokenData.error);
                return res.redirect(`${APP_URL}/admin?error=token_exchange`);
            }
            
            // Get user info
            const userRes = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'User-Agent': 'VeriBridge'
                }
            });
            
            const userData = await userRes.json();
            
            // Check allowed users
            const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());
            
            if (!allowedUsers.includes(userData.login.toLowerCase())) {
                console.error('[Auth API] Unauthorized user:', userData.login);
                return res.redirect(`${APP_URL}/admin?error=unauthorized_user`);
            }
            
            // Success - redirect with token
            return res.redirect(`${APP_URL}/admin?token=${SESSION_TOKEN}&user=${userData.login}`);
            
        } catch (err) {
            console.error('[Auth API] GitHub error:', err);
            return res.redirect(`${APP_URL}/admin?error=server_error`);
        }
    }
    
    res.status(404).json({ error: 'Not found' });
}
