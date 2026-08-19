const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const path = require('path');

const app = express();
app.use(cors());

// السماح بقراءة ملفات HTML من نفس المجلد
app.use(express.static(path.join(__dirname, '')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// إعداد خادم البث المباشر RTMP
const nmsConfig = {
    rtmp: { port: 1935, chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
    http: { port: 8000, allow_origin: '*' }
};
const nms = new NodeMediaServer(nmsConfig);
nms.run();

// --- 🧠 الذاكرة الذكية للسيرفر (لحفظ حالة القناة) ---
let appState = {
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', // الرابط الافتراضي
    mode: 'live',
    breakingText: 'مناقشة أهم التطورات الخدمية في المنطقة',
    topTickerVisibility: 'show',
    newsText: 'حالة الطقس: استقرار درجات الحرارة خلال الأيام القادمة',
    logoVisibility: 'show',
    logoUrl: 'https://i.postimg.cc/5txxv6Xv/1000865860-removebg-preview.png'
};

io.on('connection', (socket) => {
    console.log(`[+] متصل جديد: ${socket.id}`);

    // 1. فور دخول أي مشاهد جديد، نرسل له الحالة الحالية المحفوظة في الذاكرة
    socket.emit('update stream url', { url: appState.streamUrl });
    socket.emit('admin mode change', { mode: appState.mode });
    socket.emit('update breaking', { text: appState.breakingText });
    socket.emit('update top ticker control', { action: 'visibility', state: appState.topTickerVisibility });
    socket.emit('update news ticker', { text: appState.newsText });
    socket.emit('update logo control', { action: 'visibility', state: appState.logoVisibility });
    socket.emit('update logo control', { action: 'image', url: appState.logoUrl });

    // 2. استقبال التعديلات من لوحة الإدارة، حفظها في الذاكرة، ثم إرسالها للجميع
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    socket.on('admin mode change', (data) => {
        appState.mode = data.mode; // الحفظ في الذاكرة
        io.emit('admin mode change', data);
    });

    socket.on('update breaking', (data) => {
        if (data.text) appState.breakingText = data.text;
        io.emit('update breaking', data);
    });

    socket.on('update top ticker control', (data) => {
        appState.topTickerVisibility = data.state;
        io.emit('update top ticker control', data);
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

    socket.on('update stream url', (data) => {
        if (data.url) appState.streamUrl = data.url;
        io.emit('update stream url', data);
    });

    socket.on('disconnect', () => {
        console.log(`[-] غادر المستخدم: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 خادم تلفزيون خورشمام يعمل بنجاح على المنفذ ${PORT}`);
});
