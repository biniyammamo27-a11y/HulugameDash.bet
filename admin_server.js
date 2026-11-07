const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken'); // 🔐 የአድሚን ፓነልን ለመቆለፍ የተጨመረ [1.2]

const app = express();
const PORT = process.env.PORT || 5000; 

const MONGO_URI = "mongodb+srv://biniyammamo27_db_user:DxPcujpJIbfPJDLJ@cluster0.rnosp51.mongodb.net/dashbet?retryWrites=true&w=majority";
const JWT_SECRET = "HuluGame_Super_Secure_Secret_Key_2026"; // 🔐 ለደህንነት ቶከን ማረጋገጫ [1.2]
const ADMIN_PASSWORD = "HuluGameAdmin2026!!"; // 🎯 የእርስዎ የአድሚን መግቢያ ፓስወርድ ይህ ነው! [1.11]

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// 🎯 ማሻሻያ፦ በRender ላይ የሚፈጠረውን የ CORS ስህተት ለመከላከል
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

mongoose.connect(MONGO_URI)
.then(() => console.log("🟢 MongoDB Cloud Database Connected Successfully!"))
.catch(err => console.log("❌ MongoDB Connection Error: ", err));

const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 }
});
const User = mongoose.model('User', UserSchema);

const DepositSchema = new mongoose.Schema({
    id: String,
    userPhone: String,
    amount: Number,
    senderPhone: String,
    method: String,
    screenshot: String,
    status: { type: String, default: 'PENDING' },
    date: { type: String, default: () => new Date().toLocaleString('am-ET') }
});
const Deposit = mongoose.model('Deposit', DepositSchema);

const WithdrawalSchema = new mongoose.Schema({
    id: String,
    userPhone: String,
    amount: Number,
    accountNumber: String,
    fullName: String,
    method: String,
    status: { type: String, default: 'PENDING' },
    date: { type: String, default: () => new Date().toLocaleString('am-ET') }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

const DrawSchema = new mongoose.Schema({ roundNumber: Number, results: [Number], date: { type: Date, default: Date.now } });
const Draw = mongoose.model('Draw', DrawSchema);

const TicketSchema = new mongoose.Schema({
    ticketId: String,
    userPhone: String,
    roundNumber: Number,
    numbers: [Number],
    bet: Number,
    date: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', TicketSchema);

// 🔐 የአድሚን ኤፒአዮችን የሚጠብቅ የደህንነት Middleware [1.2]
function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, message: "⚠️ ያልተፈቀደ መግቢያ! መጀመሪያ ይግቡ" });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: "❌ የደህንነት ቁልፍዎ ትክክል አይደለም!" });
        next();
    });
}
// 💻 ዋናውን የጨዋታ HTML ገጽ በ ትክክለኛው ድርብ ስም መክፈቻ [1.10]
app.get('/', (req, res) => { 
    res.sendFile(path.join(__dirname, 'Dashbet3.html')); 
});
app.get('/admin-panel', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

// 🔐 ለአድሚን መግቢያ አዲስ ኤፒአይ (Admin Login API) [1.11]
app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' }); [1.2]
        return res.json({ success: true, token: token });
    }
    return res.json({ success: false, message: "❌ የአድሚን ይለፍ ቃል የተሳሳተ ነው!" });
});

app.post('/login', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ያስገቡ!" });
    try {
        const user = await User.findOne({ phone: phone.trim() });
        if (user && user.password === password) return res.json({ success: true, user: { phone: user.phone, balance: user.balance } });
        return res.json({ success: false, message: "⚠️ ስልክ ወይም የይለፍ ቃል ተሳስቷል!" });
    } catch (e) { res.json({ success: false }); }
});

app.post('/register', async (req, res) => {
    let { phone, password } = req.body;
    try {
        const existing = await User.findOne({ phone: phone.trim() });
        if (existing) return res.json({ success: false, message: "❌ ይህ ስልክ ቀድሞ ተመዝግቧል!" });
        const newUser = new User({ phone: phone.trim(), password, balance: 0.00 });
        await newUser.save();
        res.json({ success: true, message: "✅ ምዝገባዎ ተጠናቋል!" });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/place-bet', async (req, res) => {
    let { userPhone, betAmount } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user || user.balance < parseFloat(betAmount)) return res.json({ success: false });
        user.balance -= parseFloat(betAmount); await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/claim-win', async (req, res) => {
    let { userPhone, winAmount } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user) return res.json({ success: false });
        user.balance += parseFloat(winAmount); await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/deposit', async (req, res) => {
    let { userPhone, amount, senderPhone, method, screenshot } = req.body;
    try {
        if (!screenshot) return res.json({ success: false, message: "⚠️ ፎቶ ይጫኑ!" });
        const duplicate = await Deposit.findOne({ screenshot });
        if (duplicate) return res.json({ success: false, message: "❌ ይህ ማረጋገጫ ቀድሞ ጥቅም ላይ ውሏል!" });
        const newDep = new Deposit({ id: 'DEP-' + Date.now(), userPhone: userPhone.trim(), amount: parseFloat(amount), senderPhone, method, screenshot });
        await newDep.save(); res.json({ success: true, message: "✅ ጥያቄዎ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

// 💸 WITHDRAW REQUEST - ባላንሱ ወዲያውኑ HOLD ተደርጎ ይቀነሳል [1.2]
app.post('/api/withdraw', async (req, res) => {
    let { userPhone, amount, accountNumber, fullName, method } = req.body;
    try {
        const cleanPhone = userPhone.trim();
        const withdrawAmount = parseFloat(amount);
        const user = await User.findOne({ phone: cleanPhone });
        
        if (!user || user.balance < withdrawAmount) {
            return res.json({ success: false, message: "❌ ማውጣት የፈለጉት የብር መጠን ከቀሪ ሂሳብዎ በላይ ነው!" });
        }

        user.balance -= withdrawAmount; [1.2]
        await user.save();

        const newWith = new Withdrawal({ id: 'WITH-' + Date.now(), userPhone: cleanPhone, amount: withdrawAmount, accountNumber, fullName, method });
        await newWith.save(); 
        res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/save-draw', async (req, res) => {
    try { const newDraw = new Draw(req.body); await newDraw.save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.get('/api/draw-history', async (req, res) => {
    try { const history = await Draw.find({ date: { $gte: new Date(Date.now() - 24*60*60*1000) } }).sort({ _id: -1 }); res.json(history); } catch (e) { res.json([]); }
});

app.post('/api/save-ticket', async (req, res) => {
    const { ticketId, userPhone, roundNumber, numbers, bet } = req.body;
    try { const newTicket = new Ticket({ ticketId, userPhone, roundNumber, numbers, bet }); await newTicket.save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.get('/api/my-tickets/:phone', async (req, res) => {
    try { const tickets = await Ticket.find({ userPhone: req.params.phone }).sort({ _id: -1 }).limit(30); res.json(tickets); } catch (e) { res.json([]); }
});

// 🎯 ማሻሻያ፦ ሁሉም የአድሚን ዳታዎች በ requireAdmin ተቆልፈዋል [1.2]
app.get('/admin/users', requireAdmin, async (req, res) => { try { res.json(await User.find()); } catch(e) { res.json([]); } });
app.get('/admin/deposits', requireAdmin, async (req, res) => { try { res.json(await Deposit.find().sort({ _id: -1 })); } catch(e) { res.json([]); } });
app.get('/admin/withdrawals', requireAdmin, async (req, res) => { try { res.json(await Withdrawal.find().sort({ _id: -1 })); } catch(e) { res.json([]); } });

app.post('/admin/approve-deposit', requireAdmin, async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        await Deposit.findOneAndUpdate({ id }, { status: 'APPROVED' });
        const user = await User.findOne({ phone: userPhone.trim() });
        if(user) { user.balance += parseFloat(amount); await user.save(); }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/reject-deposit', requireAdmin, async (req, res) => {
    try { await Deposit.findOneAndUpdate({ id: req.body.id }, { status: 'REJECTED' }); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

// 🛠️ ADMIN APPROVE WITHDRAWAL - (🎯 ብሩ ቀድሞ ስለተቀነሰ ማጽደቅ ብቻ ነው) [1.2]
app.post('/admin/approve-withdraw', requireAdmin, async (req, res) => {
    const { id } = req.body;
    try {
        await Withdrawal.findOneAndUpdate({ id }, { status: 'APPROVED' });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 🛠️ ADMIN REJECT WITHDRAWAL - (🎯 ውድቅ ከተደረገ ብቻ ብሩ ይመለሳል) [1.2]
app.post('/admin/reject-withdraw', requireAdmin, async (req, res) => {
    const { id } = req.body;
    try {
        const withdrawal = await Withdrawal.findOne({ id });
        if (withdrawal && withdrawal.status === 'PENDING') {
            withdrawal.status = 'REJECTED';
            await withdrawal.save();
            const user = await User.findOne({ phone: withdrawal.userPhone });
            if (user) { user.balance += withdrawal.amount; await user.save(); } [1.2]
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.listen(PORT, () => { console.log(`🚀 ሰርቨሩ በፖርት ${PORT} ላይ በአስተማማኝ ሁኔታ ተነስቷል!`); });
