const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const path = require('path');
const mongoose = require('mongoose'); // مكتبة قاعدة البيانات

const app = express();
app.use(cors());
app.use(express.json()); // لدعم نظام تسجيل الدخول الآمن

// السماح بقراءة ملفات HTML من نفس المجلد
app.use(express.static(path.join(__dirname, '')));

// الاتصال بقاعدة البيانات (MongoDB) لحفظ المحادثات
mongoose.connect('mongodb://127.0.0.1:27017/khorshamam-tv')
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.log('⚠️ قاعدة البيانات غير متصلة مؤقتاً'));

// مخطط حفظ الدردشة
const chatSchema = new mongoose.Schema({ msg: String, time: { type: Date, default: Date.now } });
const Chat = mongoose.model('Chat', chatSchema);

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8 // للسماح بنقل بيانات الفيديو بدون تقطيع
});

// إعداد خادم البث المباشر RTMP
const nmsConfig = {
    rtmp: { port: 8080, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
    http: { port: 8000, allow_origin: '*' }
};
const nms = new NodeMediaServer(nmsConfig);
nms.run();
// --- نظام الحماية وتسجيل الدخول ---
let adminCredentials = {
    username: 'Khorshmam',
    password: 'K157315'
};

// مسار تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if(username === adminCredentials.username && password === adminCredentials.password) {
        res.json({ success: true, token: 'khorshamam-secure-token' });
    } else {
        res.status(401).json({ success: false, message: 'بيانات غير صحيحة' });
    }
});

// مسار تغيير كلمة المرور واسم المستخدم
app.post('/api/change-credentials', (req, res) => {
    const { newUsername, newPassword, token } = req.body;
    if(token === 'khorshamam-secure-token') {
        if (newUsername) adminCredentials.username = newUsername;
        if (newPassword) adminCredentials.password = newPassword;
        res.json({ success: true, message: 'تم التحديث بنجاح' });
    } else {
        res.status(403).json({ success: false, message: 'غير مصرح' });
    }
});

// --- 🧠 الذاكرة الذكية وقائمة التشغيل الآلية ---
let appState = {
    mode: 'live',
    topTickerVisibility: 'show',
    topTickerText: 'عاجل | تحديثات جديدة في منظومة خورشمام',
    breakingText: 'مناقشة أهم التطورات الخدمية في المنطقة',
    newsText: 'حالة الطقس: استقرار درجات الحرارة خلال الأيام القادمة',
    logoVisibility: 'show',
    logoUrl: 'https://i.postimg.cc/5txxv6Xv/1000865860-removebg-preview.png',
    
    playlist: [], // قائمة التشغيل
    currentIndex: -1, // رقم الفيديو الحالي
    isEmergency: false,
    emergencyUrl: '',
    currentUrl: '',
    programStartTime: 0,
    timer: null,
    pausedOffset: 0 // لحفظ الوقت عند قطع البرنامج
};

let liveViewers = 0;

function startPlaylistItem(index) {
    if(appState.playlist.length === 0) return;
    if(index >= appState.playlist.length) index = 0; // إعادة تشغيل القائمة من البداية عند انتهائها
    
    appState.currentIndex = index;
    let item = appState.playlist[index];
    appState.currentUrl = item.url;
    appState.programStartTime = Date.now();
    appState.isEmergency = false;
    appState.mode = 'recorded'; // الوضع المسجل لإخفاء علامة اللايف

    io.emit('admin mode change', { mode: appState.mode });
    io.emit('update stream url', { url: appState.currentUrl, offset: 0, isEmergency: false });

    clearTimeout(appState.timer);
    appState.timer = setTimeout(() => {
        startPlaylistItem(appState.currentIndex + 1); // الانتقال للفيديو التالي تلقائياً
    }, item.duration * 1000);
}

io.on('connection', async (socket) => {
    liveViewers++;
    io.emit('viewers count', liveViewers);
    
    // إرسال البيانات للمشاهد الجديد
    let currentOffset = 0;
    let urlToSend = '';
    
    if (appState.isEmergency) {
        urlToSend = appState.emergencyUrl;
        currentOffset = 0;
    } else if (appState.currentUrl) {
        urlToSend = appState.currentUrl;
        currentOffset = Math.floor((Date.now() - appState.programStartTime) / 1000);
    }
    
    socket.emit('update stream url', { url: urlToSend, offset: currentOffset, isEmergency: appState.isEmergency });
    socket.emit('admin mode change', { mode: appState.mode });
    socket.emit('update top ticker control', { action: 'visibility', state: appState.topTickerVisibility });
    socket.emit('update top ticker text', { text: appState.topTickerText });
    socket.emit('update breaking', { text: appState.breakingText });
    socket.emit('update news ticker', { text: appState.newsText });
    socket.emit('update logo control', { action: 'visibility', state: appState.logoVisibility });
    socket.emit('update logo control', { action: 'image', url: appState.logoUrl });
    socket.emit('playlist updated', appState.playlist);
    
    try {
        const history = await Chat.find().sort({ time: -1 }).limit(50);
        socket.emit('chat history', history.reverse());
    } catch (e) {}
    
    // --- أوامر قائمة التشغيل (الجديد) ---
    socket.on('add to playlist', (item) => {
        appState.playlist.push(item);
        io.emit('playlist updated', appState.playlist);
    });

    socket.on('clear playlist', () => {
        appState.playlist = [];
        clearTimeout(appState.timer);
        io.emit('playlist updated', appState.playlist);
    });

    socket.on('start playlist', () => {
        startPlaylistItem(0);
    });
    
    // --- أوامر الطوارئ ---
    socket.on('set emergency stream', (data) => {
        if (data.url) {
            appState.isEmergency = true;
            appState.emergencyUrl = data.url;
            appState.mode = 'live'; // إظهار علامة اللايف
            
            if(appState.currentUrl) {
                appState.pausedOffset = Math.floor((Date.now() - appState.programStartTime) / 1000);
                clearTimeout(appState.timer); // إيقاف العداد مؤقتاً
            }

            io.emit('admin mode change', { mode: appState.mode });
            io.emit('update stream url', { url: appState.emergencyUrl, offset: 0, isEmergency: true });
        }
    });
    
    socket.on('end emergency', () => {
        appState.isEmergency = false;
        appState.mode = 'recorded';
        io.emit('admin mode change', { mode: appState.mode });
        
        if(appState.currentUrl && appState.playlist.length > 0) {
            // استكمال البرنامج من حيث توقف
            appState.programStartTime = Date.now() - (appState.pausedOffset * 1000);
            io.emit('update stream url', { url: appState.currentUrl, offset: appState.pausedOffset, isEmergency: false });
            
            let remainingTime = (appState.playlist[appState.currentIndex].duration - appState.pausedOffset) * 1000;
            clearTimeout(appState.timer);
            appState.timer = setTimeout(() => {
                startPlaylistItem(appState.currentIndex + 1);
            }, remainingTime);
        }
    });
    
    socket.on('chat message', async (msg) => { try { await new Chat({ msg }).save(); } catch (e) {} io.emit('chat message', msg); });
    socket.on('admin mode change', (data) => { appState.mode = data.mode; io.emit('admin mode change', data); });
    socket.on('update top ticker text', (data) => { appState.topTickerText = data.text; io.emit('update top ticker text', data); });
    socket.on('update top ticker control', (data) => { appState.topTickerVisibility = data.state; io.emit('update top ticker control', data); });
    socket.on('update breaking', (data) => { appState.breakingText = data.text; io.emit('update breaking', data); });
    socket.on('update news ticker', (data) => { appState.newsText = data.text; io.emit('update news ticker', data); });
    socket.on('update logo control', (data) => {
        if (data.action === 'visibility') appState.logoVisibility = data.state;
        if (data.action === 'image' && data.url) appState.logoUrl = data.url;
        io.emit('update logo control', data);
    });
    socket.on('disconnect', () => { liveViewers--; io.emit('viewers count', liveViewers); });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 خادم التلفزيون والمجدول الذكي يعمل بنجاح على المنفذ ${PORT}`);
});
