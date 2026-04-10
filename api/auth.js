export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    const SESSION_TOKEN = 'admin_session_token';
    
    if (req.method === 'POST' && req.url.includes('/password')) {
        const { password } = req.body;
        if (password === ADMIN_PASSWORD) {
            return res.json({ success: true, token: SESSION_TOKEN });
        }
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }
    
    if (req.method === 'GET' && req.url.includes('/verify')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        return res.json({ valid: auth === SESSION_TOKEN, user: 'Admin' });
    }
    
    if (req.method === 'PUT' && req.url.includes('/password')) {
        const auth = req.headers.authorization?.replace('Bearer ', '');
        if (auth !== SESSION_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
        return res.json({ success: true });
    }
    
    if (req.method === 'GET' && req.url.includes('/github')) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const redirectUri = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/github/callback`;
        return res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user`);
    }
    
    if (req.method === 'GET' && req.url.includes('/github/callback')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');
        
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
            
            const userRes = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            });
            const userData = await userRes.json();
            
            const allowedUsers = (process.env.ALLOWED_GITHUB_USERS || '').split(',').map(u => u.trim());
            if (allowedUsers.includes(userData.login)) {
                return res.redirect(`/admin/dashboard.html?token=${SESSION_TOKEN}`);
            }
            
            return res.redirect('/admin/login.html?error=unauthorized');
        } catch (e) {
            return res.redirect('/admin/login.html?error=github_failed');
        }
    }
    
    res.status(404).json({ error: 'Not found' });
}