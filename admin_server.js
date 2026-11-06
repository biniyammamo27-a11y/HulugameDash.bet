const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000; 

// 🎯 ያንተ እውነተኛ በላይቭ የሚሠራው የ MongoDB Atlas ማገናኛ ሊንክ
const MONGO_URI = "mongodb+srv://biniyammamo27_db_user:DxPcujpJIbfPJDLJ@cluster0.rnosp51.mongodb.net/dashbet?retryWrites=true&w=majority";

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors()); // 🔓 ሎካል ላይም ሆነ ኦንላይን ላይ አድሚን ፓናሉን ያለምንም መከልከል እንዲያገናኝ ያደርጋል

// 🔌 ከ MongoDB Cloud ጋር ግንኙነት መፍጠር
mongoose.connect(MONGO_URI)
.then(() => console.log("🟢 MongoDB Cloud Database Connected Successfully!"))
.catch(err => console.log("❌ MongoDB Connection Error: ", err));

// 📝 1. የተጫዋቾች መረጃ ሰንጠረዥ (🎯 መነሻ ባላንስ 0.00 ተደርጓል!)
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 } 
});
const User = mongoose.model('User', UserSchema);

// 📝 2. የዲፖዚት ጥያቄዎች ሰንጠረዥ (Deposit Schema)
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

// 📝 3. የዊዝድሮው ጥያቄዎች ሰንጠረዥ (Withdrawal Schema)
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

// 📝 4. የኬኖ የዕጣዎች ታሪክ ሰንጠረዥ (Draw Schema)
const DrawSchema = new mongoose.Schema({
    roundNumber: Number,
    results: [Number],
    date: { type: Date, default: Date.now }
});
const Draw = mongoose.model('Draw', DrawSchema);

// ----------------- የገጾች ማሳያ መንገዶች -----------------
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'Dashbet3.html')); });
app.get('/admin-panel', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

// ----------------- ኤፒአይ መንገዶች (MONGODB API ROUTES) -----------------
app.post('/login', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ስልክ ቁጥር እና የይለፍ ቃል ያስገቡ!" });
    try {
        const user = await User.findOne({ phone: phone.trim() });
        if (user && user.password === password) {
            return res.json({ success: true, user: { phone: user.phone, balance: user.balance } });
        }
        return res.json({ success: false, message: "⚠️ ስልክ ቁጥር ወይም የይለፍ ቃል የተሳሳተ ነው!" });
    } catch (e) { res.json({ success: false, message: "❌ ስህተት ተፈጥሯል" }); }
});

app.post('/register', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ሁሉንም ፎርም በትክክል ይሙሉ!" });
    try {
        const existing = await User.findOne({ phone: phone.trim() });
        if (existing) return res.json({ success: false, message: "❌ ይህ ስልክ ቁጥር ቀድሞ የተመዘገበ ነው!" });
        
        const newUser = new User({ phone: phone.trim(), password, balance: 0.00 }); // 🎯 እዚህም 0 መሆኑ ተረጋግጧል
        await newUser.save();
        res.json({ success: true, message: "✅ ምዝገባዎ በቋሚነት በ MongoDB ተጠናቋል! አሁን መግባት ይችላሉ።" });
    } catch (e) { res.json({ success: false, message: "❌ ስህተት ተፈጥሯል" }); }
});

app.post('/api/place-bet', async (req, res) => {
    let { userPhone, betAmount } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user || user.balance < parseFloat(betAmount)) return res.json({ success: false });
        user.balance -= parseFloat(betAmount);
        await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/claim-win', async (req, res) => {
    let { userPhone, winAmount } = req.body;
    try {
        const user = await User.findOne({ phone: userPhone.trim() });
        if (!user) return res.json({ success: false });
        user.balance += parseFloat(winAmount);
        await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/deposit', async (req, res) => {
    let { userPhone, amount, senderPhone, method, screenshot } = req.body;
    try {
        if (!screenshot || screenshot === "") {
            return res.json({ success: false, message: "⚠️ እባክዎ መጀመሪያ የክፍያ ማረጋገጫ ፎቶ ይጫኑ!" });
        }

        const duplicateImage = await Deposit.findOne({ screenshot: screenshot });
        if (duplicateImage) {
            return res.json({ success: false, message: "❌ ይህ የክፍያ ማረጋገጫ (Screenshot) ቀድሞ ጥቅም ላይ ውሏል!" });
        }

        const newDep = new Deposit({ id: 'DEP-' + Date.now(), userPhone: userPhone.trim(), amount: parseFloat(amount), senderPhone, method, screenshot });
        await newDep.save();
        res.json({ success: true, message: "✅ የዲፖዚት ጥያቄዎ በክላውድ በኩል ለአድሚን ደርሷል!" });
    } catch (e) { res.json({ success: false, message: "❌ ስህተት ተፈጥሯል!" }); }
});

app.post('/api/withdraw', async (req, res) => {
    let { userPhone, amount, accountNumber, fullName, method } = req.body;
    const cleanPhone = userPhone.trim();
    try {
        const user = await User.findOne({ phone: cleanPhone });
        if (!user) return res.json({ success: false, message: "❌ ተጠቃሚው አልተገኘም!" });
        const reqAmount = parseFloat(amount);
        if (reqAmount < 80) return res.json({ success: false, message: "❌ ማውጣት የሚቻለው አነስተኛ መጠን 80 ETB ነው!" });
        if (reqAmount > user.balance) return res.json({ success: false, message: `❌ በቂ ቀሪ ሂሳብ የሎትም!` });
        
        const newWith = new Withdrawal({ id: 'WITH-' + Date.now(), userPhone: cleanPhone, amount: reqAmount, accountNumber, fullName, method });
        await newWith.save();
        res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ በክላውድ በተሳካ ሁኔታ ለአድሚን ተልኳል!" });
    } catch (e) { res.json({ success: false, message: "❌ ስህተት ተፈጥሯል!" }); }
});

app.post('/api/save-draw', async (req, res) => {
    const { roundNumber, results } = req.body;
    try {
        const newDraw = new Draw({ roundNumber, results });
        await newDraw.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/draw-history', async (req, res) => {
    try {
        const oily = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const history = await Draw.find({ date: { $gte: oily } }).sort({ _id: -1 });
        res.json(history);
    } catch (e) { res.json([]); }
});

app.get('/admin/users', async (req, res) => { 
    try { const users = await User.find(); res.json(users); } catch(e) { res.json([]); }
});

app.get('/admin/deposits', async (req, res) => {
    try { const deposits = await Deposit.find().sort({ _id: -1 }); res.json(deposits); } catch(e) { res.json([]); }
});

app.get('/admin/withdrawals', async (req, res) => {
    try { const withdrawals = await Withdrawal.find().sort({ _id: -1 }); res.json(withdrawals); } catch(e) { res.json([]); }
});

app.post('/admin/approve-deposit', async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        await Deposit.findOneAndUpdate({ id: id }, { status: 'APPROVED' });
        const user = await User.findOne({ phone: userPhone.trim() });
        if(user) { user.balance += parseFloat(amount); await user.save(); }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/approve-withdraw', async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        await Withdrawal.findOneAndUpdate({ id: id }, { status: 'APPROVED' });
        const user = await User.findOne({ phone: userPhone.trim() });
        if(user) { user.balance -= parseFloat(amount); await user.save(); }
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`🚀 ሰርቨሩ በሎካል ፖርት ${PORT} ላይ በተሳካ ሁኔታ ተነስቷል!`);
    console.log('==================================================');
});
