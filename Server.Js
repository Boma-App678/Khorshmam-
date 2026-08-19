const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const NodeMediaServer = require('node-media-server');
const path = require('path');

const app = express();
app.use(cors());

// السماح بقراءة ملفات HTML (index.html و admin.html) من نفس المجلد
app.use(express.static(path.join(__dirname, '')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// إعداد خادم البث المباشر RTMP (لاستقبال البث من برنامج OBS Studio)
const nmsConfig = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8000,
        allow_origin: '*'
    }
};

const nms = new NodeMediaServer(nmsConfig);
nms.run();

// إدارة الاتصالات والأحداث اللحظية عبر Socket.io
io.on('connection', (socket) => {
    console.log(`[+] متصل جديد: ${socket.id}`);

    // 1. تمرير رسائل المحادثة (الشات)
    socket.on('chat message', (msg) => {
        io.emit('chat message', msg);
    });

    // 2. التحكم في وضع الشاشة (مباشر / مسجل / إعلان)
    socket.on('admin mode change', (data) => {
        io.emit('admin mode change', data);
    });

    // 3. تحديث نص الشريط العلوي (مقابلة خاصة)
    socket.on('update breaking', (data) => {
        io.emit('update breaking', data);
    });

    // 4. إخفاء أو إظهار الشريط العلوي بالكامل
    socket.on('update top ticker control', (data) => {
        io.emit('update top ticker control', data);
    });

    // 5. تحديث شريط الأخبار السفلي
    socket.on('update news ticker', (data) => {
        io.emit('update news ticker', data);
    });

    // 6. التحكم في الشعار (الإظهار/الإخفاء أو تغيير صورة الشعار)
    socket.on('update logo control', (data) => {
        io.emit('update logo control', data);
    });

    // 7. تحديث رابط العرض (يوتيوب أو البث المباشر HLS)
    socket.on('update stream url', (data) => {
        io.emit('update stream url', data);
    });

    socket.on('disconnect', () => {
        console.log(`[-] غادر المستخدم: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 خادم تلفزيون خورشمام يعمل بنجاح على المنفذ ${PORT}`);
    console.log(`📡 سيرفر البث (RTMP) يعمل على المنفذ 1935 وتحويل HLS على المنفذ 8000`);
});
