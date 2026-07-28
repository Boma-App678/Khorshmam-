const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
// السماح بالاتصال من أي نطاق (ضروري لربط الواجهة الأمامية بالسيرفر)
app.use(cors()); 

const server = http.createServer(app);

// إعداد خادم Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // لاحقاً عند الإطلاق، سنضع هنا رابط النطاق الخاص بك (Domain)
        methods: ["GET", "POST"]
    }
});

// الاستماع للاتصالات الجديدة (عندما يفتح أي مشاهد صفحة التلفزيون)
io.on('connection', (socket) => {
    console.log(`[+] مشاهد جديد متصل. ID: ${socket.id}`);

    // الاستماع لحدث "إرسال رسالة" من الدردشة
    socket.on('chat message', (msgData) => {
        console.log('رسالة جديدة:', msgData);
        
        // إعادة بث الرسالة لجميع المشاهدين المتصلين (بما فيهم المرسل)
        io.emit('chat message', msgData);
    });

    // الاستماع لحدث "مغادرة" (عندما يغلق المشاهد الصفحة)
    socket.on('disconnect', () => {
        console.log(`[-] مشاهد غادر. ID: ${socket.id}`);
    });
});

// تشغيل السيرفر على المنفذ 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 خادم تلفزيون خورشمام يعمل بنجاح على المنفذ ${PORT}`);
});
