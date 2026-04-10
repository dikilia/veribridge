export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Get the path from the URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    console.log('[Auth API] Request:', req.method, path);
    
    // Admin password (fallback login)
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    const SESSION_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
    
    // ==================== PASSWORD LOGIN ====================
    if (req.method === 'POST' && path.includes('/password')) {
        const { password } = req.body;
        console.log('[Auth API] Password login attempt');
        
        if (password === ADMIN_PASSWORD) {
            console.log('[Auth API] Password login success');
            return res.json({ success: true, token: SESSION_TOKEN });
        }
        
        console.log('[Auth API] Password login failed');
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    // ==================== VERIFY TOKEN ====================
    if (req.method === 'GET' && path.includes('/verify')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        console.log('[Auth API] Verify token:', auth ? 'present' : 'missing');
        
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
        
        // Note: Password change requires server restart or KV store in production
        return res.json({ success: true, message: 'Password updated (requires redeploy)' });
    }
    
    // ==================== GITHUB OAUTH - INITIATE ====================
    if (req.method === 'GET' && path.includes('/github') && !path.includes('/callback')) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const redirectUri = process.env.APP_URL 
            ? `${process.env.APP_URL}/api/auth/github/callback`
            : `https://veribridge-dashboard.vercel.app/api/auth/github/callback`;
        
        console.log('[Auth API] GitHub OAuth initiate');
        console.log('[Auth API] Client ID:', clientId ? 'set' : 'MISSING');
        console.log('[Auth API] Redirect URI:', redirectUri);
        
        if (!clientId) {
            return res.status(500).json({ error: 'GitHub Client ID not configured' });
        }
        
        const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
        
        return res.redirect(githubAuthUrl);
    }
    
    // ==================== GITHUB OAUTH - CALLBACK ====================
    if (req.method === 'GET' && path.includes('/github/callback')) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        
        console.log('[Auth API] GitHub callback received');
        
        if (error) {
            console.log('[Auth API] GitHub returned error:', error);
            return res.redirect('/admin?error=github_denied');
        }
        
        if (!code) {
            console.log('[Auth API] No code provided');
            return res.redirect('/admin?error=no_code');
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
                    redirect_uri: process.env.APP_URL 
                        ? `${process.env.APP_URL}/api/auth/github/callback`
                        : `https://veribridge-dashboard.vercel.app/api/auth/github/callback`
                })
            });
            
            const tokenData = await tokenResponse.json();
            
            if (tokenData.error) {
                console.log('[Auth API] Token exchange error:', tokenData.error);
                return res.redirect('/admin?error=token_exchange');
            }
            
            console.log('[Auth API] Token received, fetching user...');
            
            // Get user info
            const userResponse = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'User-Agent': 'VeriBridge'
                }
            });
            
            const userData = await userResponse.json();
            console.log('[Auth API] GitHub user:', userData.login);
            
            // Check if user is allowed
            const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());
            
            if (!allowedUsers.includes(userData.login.toLowerCase())) {
                console.log('[Auth API] User not allowed:', userData.login);
                console.log('[Auth API] Allowed users:', allowedUsers);
                return res.redirect('/admin?error=unauthorized_user&user=' + userData.login);
            }
            
            console.log('[Auth API] User authorized, redirecting to dashboard');
            
            // Create session and redirect
            return res.redirect(`/dashboard?token=${SESSION_TOKEN}&user=${userData.login}`);
            
        } catch (error) {
            console.error('[Auth API] GitHub auth error:', error);
            return res.redirect('/admin?error=server_error');
        }
    }
    
    // ==================== 404 ====================
    console.log('[Auth API] Unknown path:', path);
    res.status(404).json({ error: 'Not found' });
}
