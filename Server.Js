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

// --- 🧠 الذاكرة الذكية للسيرفر (تم تحديثها لنظام المجدول) ---
let appState = {
    mode: 'live',
    topTickerVisibility: 'show',
    topTickerText: 'عاجل | تحديثات جديدة في منظومة خورشمام',
    breakingText: 'مناقشة أهم التطورات الخدمية في المنطقة',
    newsText: 'حالة الطقس: استقرار درجات الحرارة خلال الأيام القادمة',
    logoVisibility: 'show',
    logoUrl: 'https://i.postimg.cc/5txxv6Xv/1000865860-removebg-preview.png',
    
    // ⏰ متغيرات المجدول الذكي
    isEmergency: false, // هل نحن في وضع البث الطارئ الآن؟
    emergencyUrl: '', // رابط البث الطارئ/المباشر
    scheduledProgramUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A', // رابط البرنامج المسجل أو الإعلانات
    programStartTime: Date.now(), // وقت بدء البرنامج المسجل
};

let liveViewers = 0; // عداد المشاهدين

io.on('connection', async (socket) => {
    console.log(`[+] متصل جديد: ${socket.id}`);
    
    liveViewers++;
    io.emit('viewers count', liveViewers);
    
    // 1. حساب التوقيت الدقيق للمشاهد الجديد
    let currentOffset = 0;
    let currentUrl = '';
    
    if (appState.isEmergency) {
        currentUrl = appState.emergencyUrl;
        currentOffset = 0; // البث المباشر/الطارئ لا يحتاج تقديم زمن
    } else {
        currentUrl = appState.scheduledProgramUrl;
        // حساب عدد الثواني التي مرت منذ بداية البرنامج
        currentOffset = Math.floor((Date.now() - appState.programStartTime) / 1000);
    }
    
    // إرسال الرابط مع نقطة البداية (الثواني)
    socket.emit('update stream url', {
        url: currentUrl,
        offset: currentOffset,
        isEmergency: appState.isEmergency
    });
    
    socket.emit('admin mode change', { mode: appState.mode });
    socket.emit('update top ticker control', { action: 'visibility', state: appState.topTickerVisibility });
    socket.emit('update top ticker text', { text: appState.topTickerText });
    socket.emit('update breaking', { text: appState.breakingText });
    socket.emit('update news ticker', { text: appState.newsText });
    socket.emit('update logo control', { action: 'visibility', state: appState.logoVisibility });
    socket.emit('update logo control', { action: 'image', url: appState.logoUrl });
    
    // إرسال أرشيف المحادثات السابقة للمشاهد الجديد
    try {
        const history = await Chat.find().sort({ time: -1 }).limit(50);
        socket.emit('chat history', history.reverse());
    } catch (e) {
        console.log("خطأ في جلب المحادثات السابقة");
    }
    
    // --- 🚀 وسيط البث المباشر (WebRTC) ---
    socket.on('broadcast stream', (data) => {
        socket.broadcast.emit('receive stream', data);
    });
    
    // --- ⏰ أوامر المجدول الذكي للتحكم في القناة ---
    
    // أمر 1: تشغيل برنامج أو إعلان جديد
    socket.on('set scheduled program', (data) => {
        if (data.url) {
            appState.scheduledProgramUrl = data.url;
            appState.programStartTime = Date.now(); // تصفير العداد وبدء البرنامج الآن
            appState.isEmergency = false;
            
            io.emit('update stream url', {
                url: appState.scheduledProgramUrl,
                offset: 0,
                isEmergency: false
            });
        }
    });
    
    // أمر 2: قطع البرنامج والانتقال لحدث طارئ/مباشر
    socket.on('set emergency stream', (data) => {
        if (data.url) {
            appState.emergencyUrl = data.url;
            appState.isEmergency = true;
            
            io.emit('update stream url', {
                url: appState.emergencyUrl,
                offset: 0,
                isEmergency: true
            });
        }
    });
    
    // أمر 3: إنهاء الطوارئ والعودة للبرنامج الأصلي
    socket.on('end emergency', () => {
        appState.isEmergency = false;
        // حساب الدقائق والثواني التي مرت من البرنامج أثناء الطوارئ
        let passedSeconds = Math.floor((Date.now() - appState.programStartTime) / 1000);
        
        io.emit('update stream url', {
            url: appState.scheduledProgramUrl,
            offset: passedSeconds,
            isEmergency: false
        });
    });
    
    // --- باقي أوامر لوحة الإدارة ---
    socket.on('chat message', async (msg) => {
        try { await new Chat({ msg }).save(); } catch (e) {}
        io.emit('chat message', msg);
    });
    
    socket.on('admin mode change', (data) => {
        appState.mode = data.mode;
        io.emit('admin mode change', data);
    });
    
    socket.on('update top ticker text', (data) => {
        if (data.text) appState.topTickerText = data.text;
        io.emit('update top ticker text', data);
    });
    
    socket.on('update top ticker control', (data) => {
        appState.topTickerVisibility = data.state;
        io.emit('update top ticker control', data);
    });
    
    socket.on('update breaking', (data) => {
        if (data.text) appState.breakingText = data.text;
        io.emit('update breaking', data);
    });
    
    socket.on('update news ticker', (data) => {
        if (data.text) appState.newsText = data.text;
        io.emit('update news ticker', data);
    });
    
    socket.on('update logo control', (data) => {
        if (data.action === 'visibility') appState.logoVisibility = data.state;
        if (data.action === 'image' && data.url) appState.logoUrl = data.url;
        io.emit('update logo control', data);
    });
    
    socket.on('disconnect', () => {
        console.log(`[-] غادر المستخدم: ${socket.id}`);
        liveViewers--;
        io.emit('viewers count', liveViewers);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 خادم التلفزيون والمجدول الذكي يعمل بنجاح على المنفذ ${PORT}`);
});
