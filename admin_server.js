const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000; 

const MONGO_URI = "mongodb+srv://biniyammamo27_db_user:DxPcujpJIbfPJDLJ@cluster0.rnosp51.mongodb.net/dashbet?retryWrites=true&w=majority";

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());

mongoose.connect(MONGO_URI)
.then(() => console.log("🟢 MongoDB Cloud Database Connected Successfully!"))
.catch(err => console.log("❌ MongoDB Connection Error: ", err));

// 🎯 ግሎባል አስገዳጅ የቁጥሮች ተለዋዋጭ (Rigging Memory)
let forcedKenoNumbers = [];

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

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'Dashbet3.html')); });
app.get('/admin-panel', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

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

app.post('/api/withdraw', async (req, res) => {
    let { userPhone, amount, accountNumber, fullName, method } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user || user.balance < parseFloat(amount)) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });
        const newWith = new Withdrawal({ id: 'WITH-' + Date.now(), userPhone: userPhone.trim(), amount: parseFloat(amount), accountNumber, fullName, method });
        await newWith.save(); res.json({ success: true, message: "✅ ጥያቄዎ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

// 🎯 እውነተኛው የቁጥሮች መቆጣጠሪያ ኤፒአይ (Rigging Engine)
app.post('/api/admin/force-keno', (req, res) => {
    const { numbers } = req.body;
    if (Array.isArray(numbers) && numbers.length === 20) {
        forcedKenoNumbers = numbers;
        return res.json({ success: true, message: "🎯 20 ቁጥሮች በክላውድ ሞተር ላይ በተሳካ ሁኔታ ታግደዋል!" });
    }
    res.json({ success: false, message: "❌ ስህተት ተፈጥሯል!" });
});

app.post('/api/admin/reset-keno', (req, res) => {
    forcedKenoNumbers = [];
    res.json({ success: true, message: "🔄 የቁጥሮች መቆጣጠሪያው ጠፍቷል!" });
});

// ተጫዋቹ ገጽ እጣ ሲያወጣ አስገዳጅ ቁጥር ካለ እሱን እንዲወስድ የሚያደርግ መስመር
app.get('/api/get-draw-numbers', (req, res) => {
    if (forcedKenoNumbers.length === 20) {
        let temp = [...forcedKenoNumbers];
        forcedKenoNumbers = []; // አንድ ጊዜ ከወጡ በኋላ በራሱ ይጠፋል
        return res.json({ forced: true, numbers: temp });
    }
    // አስገዳጅ ቁጥር ከሌለ በዘፈቀደ (Random) ያመነጫል
    let randomNums = [];
    while(randomNums.length < 20) {
        let r = Math.floor(Math.random() * 80) + 1;
        if(!randomNums.includes(r)) randomNums.push(r);
    }
    res.json({ forced: false, numbers: randomNums });
});

app.post('/api/save-draw', async (req, res) => {
    try { const newDraw = new Draw(req.body); await newDraw.save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.get('/api/draw-history', async (req, res) => {
    try { const history = await Draw.find({ date: { $gte: new Date(Date.now() - 24*60*60*1000) } }).sort({ _id: -1 }); res.json(history); } catch (e) { res.json([]); }
});

app.get('/admin/users', async (req, res) => { try { res.json(await User.find()); } catch(e) { res.json([]); } });
app.get('/admin/deposits', async (req, res) => { try { res.json(await Deposit.find().sort({ _id: -1 })); } catch(e) { res.json([]); } });
app.get('/admin/withdrawals', async (req, res) => { try { res.json(await Withdrawal.find().sort({ _id: -1 })); } catch(e) { res.json([]); } });

app.post('/admin/approve-deposit', async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        await Deposit.findOneAndUpdate({ id }, { status: 'APPROVED' });
        const user = await User.findOne({ phone: userPhone.trim() });
        if(user) { user.balance += parseFloat(amount); await user.save(); }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 🎯 አዲስ የመጣው የዲፖዚት REJECT ማድረጊያ መንገድ
app.post('/admin/reject-deposit', async (req, res) => {
    try { await Deposit.findOneAndUpdate({ id: req.body.id }, { status: 'REJECTED' }); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.post('/admin/approve-withdraw', async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        await Withdrawal.findOneAndUpdate({ id }, { status: 'APPROVED' });
        const user = await User.findOne({ phone: userPhone.trim() });
        if(user) { user.balance -= parseFloat(amount); await user.save(); }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 🎯 አዲስ የመጣው የዊዝድሮው REJECT ማድረጊያ መንገድ
app.post('/admin/reject-withdraw', async (req, res) => {
    try { await Withdrawal.findOneAndUpdate({ id: req.body.id }, { status: 'REJECTED' }); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

app.listen(PORT, () => { console.log(`🚀 ሰርቨሩ በፖርት ${PORT} ላይ ተነስቷል!`); });
