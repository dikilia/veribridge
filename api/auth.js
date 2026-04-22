// Your secure password - CHANGE THIS to your own!
const MASTER_PASSWORD = 'VeriBridge2026!Secure';  // ← CHANGE THIS TO YOUR PASSWORD

// Admin token (also change this to something unique)
const SESSION_TOKEN = 'vb_admin_' + Math.random().toString(36).substring(2, 15);

let cachedSettings = { adminPassword: MASTER_PASSWORD, adminToken: SESSION_TOKEN };

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    const ADMIN_PASSWORD = cachedSettings.adminPassword;
    const ADMIN_TOKEN = cachedSettings.adminToken;
    const APP_URL = process.env.APP_URL || 'https://veribridge-dashboard.vercel.app';
    
    console.log('[Auth API] Request:', req.method, path);
    
    // ==================== PASSWORD LOGIN ====================
    if (req.method === 'POST' && path.includes('/password')) {
        const { password } = req.body;
        
        if (password === ADMIN_PASSWORD) {
            console.log('[Auth API] Login SUCCESS');
            return res.json({ success: true, token: ADMIN_TOKEN });
        }
        console.log('[Auth API] Login FAILED');
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    // ==================== VERIFY TOKEN ====================
    if (req.method === 'GET' && path.includes('/verify')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth === ADMIN_TOKEN) {
            return res.json({ valid: true, user: 'Admin' });
        }
        return res.json({ valid: false });
    }
    
    // ==================== CHANGE PASSWORD ====================
    if (req.method === 'PUT' && path.includes('/password')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth !== ADMIN_TOKEN) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { password: newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        // Update the cached password
        cachedSettings.adminPassword = newPassword;
        console.log('[Auth API] Password changed successfully');
        
        return res.json({ success: true, message: 'Password updated' });
    }
    
    // ==================== GITHUB OAUTH (OPTIONAL) ====================
    if (req.method === 'GET' && path.includes('/github') && !path.includes('/callback')) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) {
            return res.redirect(`${APP_URL}/admin?error=github_not_configured`);
        }
        const redirectUri = `${APP_URL}/api/auth/github/callback`;
        return res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`);
    }
    
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
                    code: code
                })
            });
            const tokenData = await tokenRes.json();
            if (tokenData.error) return res.redirect(`${APP_URL}/admin?error=token_exchange`);
            
            const userRes = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'User-Agent': 'VeriBridge' }
            });
            const userData = await userRes.json();
            
            const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim().toLowerCase());
            if (allowedUsers.length > 0 && !allowedUsers.includes(userData.login.toLowerCase())) {
                return res.redirect(`${APP_URL}/admin?error=unauthorized_user&user=${userData.login}`);
            }
            
            return res.redirect(`${APP_URL}/admin?token=${ADMIN_TOKEN}&user=${userData.login}`);
        } catch (err) {
            return res.redirect(`${APP_URL}/admin?error=server_error`);
        }
    }
    
    res.status(404).json({ error: 'Not found' });
}
