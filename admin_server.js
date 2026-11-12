const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const config = require('./config');
const { User, Deposit, Withdrawal, Draw, Ticket } = require('./models');
const { requireAdmin, requireAdminPage, requireUser } = require('./middlewares');

const app = express();

app.use(express.json({ limit: '15mb' })); 
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(cookieParser());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// ================= 🎰 FAST KENO AUTOMATION & PAYOUT ENGINE =================

const KENO_PAYOUT_ODDS = {
    1: { 1: 3 }, 2: { 2: 5 }, 3: { 2: 2, 3: 50 }, 4: { 2: 1, 3: 5, 4: 80 }, 5: { 3: 3, 4: 15, 5: 200 },
    6: { 3: 1, 4: 6, 5: 50, 6: 500 }, 7: { 4: 3, 5: 15, 6: 100, 7: 700 }, 8: { 4: 1, 5: 10, 6: 50, 7: 300, 8: 800 },
    9: { 4: 1, 5: 5, 6: 25, 7: 150, 8: 500, 9: 1000 }, 10: { 4: 1, 5: 3, 6: 15, 7: 50, 8: 300, 9: 500, 10: 1200 }
};

let customKenoNumbers = null; 
let currentRoundNumber = 1001;   
let nextDrawTime = Date.now() + 60 * 1000; 
let latestDrawResults = new Array();   
let fakePlayersLiveBets = new Array(); 
let isBotMachineActive = false; 
let botIntervalTimer = null;

function generateFakePlayersForRound() {
    if (fakePlayersLiveBets.length === 0) {
        let numberOfFakePlayers = Math.floor(Math.random() * 3) + 3;
        const prefixes = new Array("0911", "0912", "0920", "0930", "0940", "0909", "0711");
        const fakeAmounts = new Array(125, 150, 200, 300, 400, 500, 600, 1000, 2000, 3000);
        
        for(let i = 0; i < numberOfFakePlayers; i++) {
            let fakePhone = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(100000 + Math.random() * 900000);
            let randomBet = fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
            let fakePickedNumbers = new Array();
            while(fakePickedNumbers.length < 3) {
                let r = Math.floor(Math.random() * 80) + 1;
                if(!fakePickedNumbers.includes(r)) fakePickedNumbers.push(r);
            }
            fakePlayersLiveBets.push({
                userPhone: fakePhone.substring(0, 4) + "****" + fakePhone.substring(8),
                bet: randomBet,
                numbers: fakePickedNumbers.sort((a, b) => a - b),
                isFake: true
            });
        }
    }
}

function runThreeSecondBotEngine() {
    if (botIntervalTimer) clearInterval(botIntervalTimer);
    botIntervalTimer = setInterval(() => {
        if (!isBotMachineActive) return;
        const prefixes = new Array("0911", "0912", "0920", "0930", "0940", "0909", "0915", "0922", "0935", "0700", "0799");
        const fakeAmounts = new Array(125, 150, 200, 300, 400, 500, 600, 1000, 2000, 3000);
        let fakePhone = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(100000 + Math.random() * 900000);
        let randomBet = fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
        let fakePickedNumbers = new Array();
        while(fakePickedNumbers.length < 3) {
            let r = Math.floor(Math.random() * 80) + 1;
            if(!fakePickedNumbers.includes(r)) fakePickedNumbers.push(r);
        }
        fakePlayersLiveBets.unshift({
            userPhone: fakePhone.substring(0, 4) + "****" + fakePhone.substring(8),
            bet: randomBet,
            numbers: fakePickedNumbers.sort((a, b) => a - b),
            isFake: true
        });
        if (fakePlayersLiveBets.length > 40) fakePlayersLiveBets.pop();
    }, 3000); 
}
async function startKenoGameLoop() {
    const lastDraw = await Draw.findOne().sort({ _id: -1 });
    if (lastDraw && lastDraw.roundNumber) {
        currentRoundNumber = lastDraw.roundNumber + 1;
    }

    generateFakePlayersForRound();
    runThreeSecondBotEngine();
    nextDrawTime = Date.now() + 60 * 1000;

    setInterval(async () => {
        let finalNumbers = [];
        if (customKenoNumbers && customKenoNumbers.length === 20) {
            finalNumbers = [...customKenoNumbers];
            customKenoNumbers = null; 
        } else {
            while(finalNumbers.length < 20){
                let r = Math.floor(Math.random() * 80) + 1;
                if(!finalNumbers.includes(r)) finalNumbers.push(r);
            }
        }

        latestDrawResults = finalNumbers;
        const roundToProcess = currentRoundNumber;

        try {
            const newDraw = new Draw({ roundNumber: roundToProcess, results: finalNumbers, date: new Date() });
            await newDraw.save();

            const activeTickets = await Ticket.find({ roundNumber: roundToProcess });
            for (let ticket of activeTickets) {
                const uniqueNumbers = [...new Set(ticket.numbers)];
                const pickedCount = uniqueNumbers.length;
                const matchedCount = uniqueNumbers.filter(n => finalNumbers.includes(n)).length;

                if (KENO_PAYOUT_ODDS[pickedCount] && KENO_PAYOUT_ODDS[pickedCount][matchedCount]) {
                    const odds = KENO_PAYOUT_ODDS[pickedCount][matchedCount];
                    const rawWin = ticket.bet * odds;
                    const finalWin = rawWin > 30000 ? 30000 : rawWin;
                    if (finalWin > 0) {
                        await User.findOneAndUpdate({ phone: ticket.userPhone }, { $inc: { balance: finalWin } });
                    }
                }
            }

            if (!isBotMachineActive) {
                fakePlayersLiveBets = [];
                generateFakePlayersForRound();
            }

            currentRoundNumber++;
            nextDrawTime = Date.now() + 60 * 1000; 
        } catch (err) { console.error("Draw Error:", err); }
    }, 60 * 1000); 
}

// --- FRONTEND ROUTES ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'Dashbet3.html')); });
app.get('/admin-login', (req, res) => { res.sendFile(path.join(__dirname, 'admin-login.html')); });
app.get('/admin-panel', requireAdminPage, (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });
app.use(express.static(path.join(__dirname)));

// --- GAME & PUBLIC APIs ---
app.get('/api/keno-status', (req, res) => {
    res.json({
        success: true,
        roundNumber: currentRoundNumber,
        timeLeft: Math.max(0, Math.floor((nextDrawTime - Date.now()) / 1000)), 
        latestResults: latestDrawResults,
        fakeBets: fakePlayersLiveBets 
    });
});

app.get('/api/draw-history', async (req, res) => {
    try {
        const history = await Draw.find().sort({ _id: -1 }).limit(50);
        res.json(history.reverse());
    } catch (e) { res.json([]); }
});

// --- AUTH APIs ---
app.post('/admin/login', (req, res) => {
    const password = req.body && req.body.password;
    if (!password) return res.json({ success: false, message: "⚠️ እባክዎ መጀመሪያ የይለፍ ቃል ያስገቡ!" });
    if (password.trim() === config.ADMIN_PASSWORD.trim()) {
        const token = jwt.sign({ admin: true }, config.JWT_SECRET, { expiresIn: '24h' });
        res.cookie('adminToken', token, { httpOnly: true, secure: true, sameSite: 'None', maxAge: 24 * 60 * 60 * 1000 });
        return res.json({ success: true, token: token });
    }
    return res.json({ success: false, message: "❌ የይለፍ ቃል የተሳሳተ ነው!" });
});

app.post('/register', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ ስልክ እና የይለፍ ቃል ያስገቡ!" });
    try {
        const existing = await User.findOne({ phone: phone.trim() });
        if (existing) return res.json({ success: false, message: "❌ ይህ ስልክ ቀድሞ ተመዝግቧል!" });
        const hashedPassword = await bcrypt.hash(password.trim(), 10);
        const newUser = new User({ phone: phone.trim(), password: hashedPassword, balance: 0.00 });
        await newUser.save(); 
        res.json({ success: true, message: "✅ ምዝገባዎ ተጠናቋል!" });
    } catch (e) { res.json({ success: false, message: "❌ ስህተት ተፈጥሯል!" }); }
});

app.post('/login', async (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ ስልክ እና የይለፍ ቃል ያስገቡ!" });
    try {
        const user = await User.findOne({ phone: phone.trim() });
        if (!user) return res.json({ success: false, message: "⚠️ ስልክ ወይም የይለፍ ቃል ተሳስቷል!" });
        
        const isMatch = user.password.startsWith('$2b$') 
            ? await bcrypt.compare(password.trim(), user.password) 
            : (user.password === password.trim());

        if (isMatch) {
            const token = jwt.sign({ phone: user.phone }, config.JWT_SECRET, { expiresIn: '24h' });
            return res.json({ success: true, token: token, user: { phone: user.phone, balance: user.balance } });
        }
        return res.json({ success: false, message: "⚠️ ስልክ ወይም የይለፍ ቃል ተሳስቷል!" });
    } catch (e) { res.json({ success: false }); }
});

// --- USER PROTECTED APIs ---
app.get('/api/my-balance', requireUser, async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.userPhone });
        res.json({ success: true, balance: user ? user.balance : 0 });
    } catch (e) { res.json({ success: false }); }
});
app.post('/api/place-bet', requireUser, async (req, res) => {
    const { betAmount, numbers } = req.body;
    const amount = parseFloat(betAmount);

    if (!amount || amount <= 0 || isNaN(amount)) {
        return res.json({ success: false, message: "❌ ትክክለኛ የብር መጠን ያስገቡ!" });
    }
    if (!Array.isArray(numbers) || numbers.length < 1 || numbers.length > 10) {
        return res.json({ success: false, message: "❌ ከ1 እስከ 10 ቁጥሮችን ብቻ ይምረጡ!" });
    }
    const cleanNumbers = [...new Set(numbers.map(Number))].filter(n => n >= 1 && n <= 80);
    if (cleanNumbers.length !== numbers.length) {
        return res.json({ success: false, message: "❌ ተደጋጋሚ ወይም የተሳሳቱ ቁጥሮች ተገኝተዋል!" });
    }

    try {
        const user = await User.findOneAndUpdate(
            { phone: req.userPhone, balance: { $gte: amount } }, 
            { $inc: { balance: -amount } }, 
            { new: true }
        );
        if (!user) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });

        const ticketId = 'TK-' + Math.floor(100000 + Math.random() * 900000);
        const newTicket = new Ticket({
            ticketId,
            userPhone: req.userPhone,
            roundNumber: currentRoundNumber,
            numbers: cleanNumbers,
            bet: amount
        });
        await newTicket.save();

        res.json({ success: true, newBalance: user.balance, ticketId, roundNumber: currentRoundNumber });
    } catch (e) { res.json({ success: false, message: "❌ ትኬቱን መቁረጥ አልተቻለም!" }); }
});

app.post('/api/deposit', requireUser, async (req, res) => {
    let { amount, senderPhone, method, screenshot } = req.body;
    const depAmount = parseFloat(amount);
    if (!depAmount || depAmount <= 0 || !screenshot) {
        return res.json({ success: false, message: "❌ ትክክለኛ መረጃ እና ደረሰኝ ያስገቡ!" });
    }
    try {
        const duplicate = await Deposit.findOne({ screenshot });
        if (duplicate) return res.json({ success: false, message: "❌ ይህ የክፍያ ማረጋገጫ ቀድሞ ጥቅም ላይ ውሏል!" });
        const newDep = new Deposit({ 
            id: 'DEP-' + Date.now(), 
            userPhone: req.userPhone, 
            amount: depAmount, 
            senderPhone, 
            method, 
            screenshot, 
            status: 'PENDING' 
        });
        await newDep.save(); 
        res.json({ success: true, message: "✅ ጥያቄዎ በተሳካ ሁኔታ አድሚን ላይ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/withdraw', requireUser, async (req, res) => {
    const withdrawAmount = parseFloat(req.body.amount);
    if (!withdrawAmount || withdrawAmount <= 0 || isNaN(withdrawAmount)) {
        return res.json({ success: false, message: "❌ ትክክለኛ የብር መጠን ያስገቡ!" });
    }
    try {
        const result = await User.findOneAndUpdate(
            { phone: req.userPhone, balance: { $gte: withdrawAmount } }, 
            { $inc: { balance: -withdrawAmount } }, 
            { new: true }
        );
        if (!result) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });
        const newWith = new Withdrawal({ 
            id: 'WITH-' + Date.now(), 
            userPhone: req.userPhone, 
            amount: withdrawAmount, 
            accountNumber: req.body.accountNumber, 
            fullName: req.body.fullName, 
            method: req.body.method, 
            status: 'PENDING' 
        });
        await newWith.save(); 
        res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ አድሚን ላይ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

// --- ADMIN PROTECTED APIs ---
app.get('/admin/bot-status', requireAdmin, (req, res) => { res.json({ success: true, isBotActive: isBotMachineActive }); });
app.post('/admin/toggle-bot', requireAdmin, (req, res) => {
    isBotMachineActive = Boolean(req.body.activate);
    res.json({ success: true, message: isBotMachineActive ? "🟢 የ 3 ሰከንድ ቦት ማሽን ስራ ጀምሯል!" : "🔴 ቦት ማሽኑ ቆሟል!" });
});
app.post('/admin/set-keno-numbers', requireAdmin, (req, res) => {
    const { numbers } = req.body;
    if (!numbers || numbers.length !== 20) return res.json({ success: false, message: "❌ እባክዎ በትክክል 20 ቁጥሮችን ይምረጡ!" });
    customKenoNumbers = numbers.map(Number);
    res.json({ success: true, message: "🟢 ቀጣዩ እጣ በአንተ ቁጥሮች እንዲወጣ በራስ-ሰር ተቆልፏል!" });
});
app.get('/admin/users', requireAdmin, async (req, res) => { try { const list = await User.find().select('-password'); res.json(list); } catch(e) { res.json([]); } });
app.get('/admin/deposits', requireAdmin, async (req, res) => { try { const list = await Deposit.find().select('-screenshot').sort({ _id: -1 }); res.json(list); } catch(e) { res.json([]); } });
app.get('/admin/deposit-image/:id', requireAdmin, async (req, res) => { try { const dep = await Deposit.findOne({ id: req.params.id }).select('screenshot'); if (dep) res.json({ success: true, screenshot: dep.screenshot }); else res.json({ success: false }); } catch(e) { res.json({ success: false }); } });
app.get('/admin/withdrawals', requireAdmin, async (req, res) => { try { const list = await Withdrawal.find().sort({ _id: -1 }); res.json(list); } catch(e) { res.json([]); } });

app.post('/admin/approve-deposit', requireAdmin, async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        const deposit = await Deposit.findOneAndUpdate({ id, status: 'PENDING' }, { status: 'APPROVED' });
        if(deposit) { await User.findOneAndUpdate({ phone: userPhone.trim() }, { $inc: { balance: parseFloat(amount) } }); return res.json({ success: true }); }
        res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});
app.post('/admin/reject-deposit', requireAdmin, async (req, res) => { try { await Deposit.findOneAndUpdate({ id: req.body.id, status: 'PENDING' }, { status: 'REJECTED' }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/admin/approve-withdraw', requireAdmin, async (req, res) => { try { await Withdrawal.findOneAndUpdate({ id: req.body.id, status: 'PENDING' }, { status: 'APPROVED' }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });
app.post('/admin/reject-withdraw', requireAdmin, async (req, res) => { try { const withdrawal = await Withdrawal.findOneAndUpdate({ id: req.body.id, status: 'PENDING' }, { status: 'REJECTED' }); if (withdrawal) await User.findOneAndUpdate({ phone: withdrawal.userPhone }, { $inc: { balance: withdrawal.amount } }); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

mongoose.connect(config.MONGO_URI).then(() => {
    console.log("✅ ከ MongoDB ዳታቤዝ ጋር በተሳካ ሁኔታ ተገናኝቷል!");
    startKenoGameLoop();
    app.listen(config.PORT, () => { console.log(`💼 ሰርቨሩ በፖርት ${config.PORT} ላይ በአስተማማኝ ሁኔታ ተነስቷል!`); });
}).catch(err => console.error("❌ የዳታቤዝ ግንኙነት ስህተት:", err));
