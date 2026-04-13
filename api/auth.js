export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    const SESSION_TOKEN = process.env.ADMIN_TOKEN || 'admin_session_token';
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
    
    // Change password
    if (req.method === 'PUT' && path.includes('/password')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth !== SESSION_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
        return res.json({ success: true });
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
