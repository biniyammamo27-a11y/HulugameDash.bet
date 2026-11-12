// admin_server.js - ክፍል 1
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { User, Deposit, Withdrawal, Draw, Ticket } = require('./models');
const { requireAdmin, requireAdminPage, requireUser } = require('./middlewares');

const app = express();

app.use(express.json({ limit: '100mb' })); 
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// ================= 🎰 FAST KENO AUTOMATION & 3-SECOND BOT SYSTEM =================

let customKenoNumbers = null; 
let currentRoundNumber = 1;   
let nextDrawTime = Date.now() + 60 * 1000; 

let latestDrawResults = new Array();   
let fakePlayersLiveBets = new Array(); 

let isBotMachineActive = false; 
let botIntervalTimer = null;

function generateFakePlayersForRound() {
    if (fakePlayersLiveBets.length === 0) {
        fakePlayersLiveBets = new Array();
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
// admin_server.js - ክፍል 2
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

        if (fakePlayersLiveBets.length > 40) {
            fakePlayersLiveBets.pop();
        }
    }, 3000); 
}

function startKenoGameLoop() {
    Draw.findOne().sort({ _id: -1 }).then(lastDraw => {
        if(lastDraw) currentRoundNumber = lastDraw.roundNumber + 1;
    });

    generateFakePlayersForRound();
    runThreeSecondBotEngine();

    setInterval(async () => {
        let finalNumbers = new Array();
        if (customKenoNumbers && customKenoNumbers.length === 20) {
            finalNumbers = [...customKenoNumbers];
            customKenoNumbers = null; 
        } else {
            while(finalNumbers.length < 20){
                let r = Math.floor(Math.random() * 80) + 1;
                if(finalNumbers.indexOf(r) === -1) finalNumbers.push(r);
            }
        }

        latestDrawResults = finalNumbers;
        const currentRound = currentRoundNumber;

        try {
            const newDraw = new Draw({ roundNumber: currentRound, results: finalNumbers, date: new Date() });
            await newDraw.save();

            const activeTickets = await Ticket.find({ roundNumber: currentRound });
            for (let ticket of activeTickets) {
                const matchedCount = ticket.numbers.filter(n => finalNumbers.includes(n)).length;
                let winMultiplier = 0;
                if (ticket.numbers.length === 3) {
                    if (matchedCount === 2) winMultiplier = 5;
                    else if (matchedCount === 3) winMultiplier = 15;
                } else {
                    if (matchedCount === 1) winMultiplier = 2;
                    else if (matchedCount === 2) winMultiplier = 3;
                    else if (matchedCount === 3) winMultiplier = 5;
                    else if (matchedCount === 4) winMultiplier = 10;
                    else if (matchedCount === 5) winMultiplier = 25;
                    else if (matchedCount === 6) winMultiplier = 80;
                    else if (matchedCount === 7) winMultiplier = 150;
                    else if (matchedCount === 8) winMultiplier = 500;
                    else if (matchedCount === 9) winMultiplier = 2500;
                    else if (matchedCount === 10) winMultiplier = 10000;
                }

                if (winMultiplier > 0) {
                    await User.findOneAndUpdate({ phone: ticket.userPhone }, { $inc: { balance: ticket.bet * winMultiplier } });
                }
            }

            if (!isBotMachineActive) {
                fakePlayersLiveBets = new Array();
                generateFakePlayersForRound();
            }

            currentRoundNumber++;
            nextDrawTime = Date.now() + 60 * 1000; 
        } catch (err) { console.log(err); }
    }, 60 * 1000); 
}

// --- ROUTES & FRONTEND SERVING (🛡️ Header conflict resolved!) ---
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'Dashbet3.html')); });
app.get('/admin-login', (req, res) => { res.sendFile(path.join(__dirname, 'admin-login.html')); });
app.get('/admin-panel', (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });

app.use(express.static(path.join(__dirname)));
// admin_server.js - ክፍል 3
app.get('/admin/bot-status', requireAdmin, (req, res) => {
    res.json({ success: true, isBotActive: isBotMachineActive });
});

app.post('/admin/toggle-bot', requireAdmin, (req, res) => {
    isBotMachineActive = req.body.activate;
    res.json({ success: true, message: isBotMachineActive ? "🟢 የ 3 ሰከንድ ቦት ማሽን ስራ ጀምሯል!" : "🔴 ቦት ማሽኑ ቆሟል!" });
});

app.get('/api/keno-status', (req, res) => {
    res.json({
        success: true,
        roundNumber: currentRoundNumber,
        timeLeft: Math.max(0, Math.floor((nextDrawTime - Date.now()) / 1000)), 
        latestResults: latestDrawResults,
        fakeBets: fakePlayersLiveBets 
    });
});

app.get('/api/next-numbers', (req, res) => {
    if (latestDrawResults.length === 20) return res.json({ success: true, numbers: latestDrawResults });
    let numbers = new Array(); while(numbers.length < 20){ let r = Math.floor(Math.random() * 80) + 1; if(numbers.indexOf(r) === -1) numbers.push(r); }
    res.json({ success: true, numbers: numbers });
});

app.post('/admin/set-keno-numbers', requireAdmin, (req, res) => {
    const { numbers } = req.body;
    if (!numbers || numbers.length !== 20) return res.json({ success: false, message: "❌ እባክዎ በትክክል 20 ቁጥሮችን ይምረጡ!" });
    customKenoNumbers = numbers.map(Number);
    res.json({ success: true, message: "🟢 ቀጣዩ እጣ በአንተ ቁጥሮች እንዲወጣ በራስ-ሰር ተቆልፏል!" });
});

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

app.post('/login', async (req, res) => {
    let { phone, password } = req.body;
    try {
        const user = await User.findOne({ phone: phone.trim() });
        if (user && user.password === password.trim()) {
            const token = jwt.sign({ phone: user.phone }, config.JWT_SECRET, { expiresIn: '24h' });
            return res.json({ success: true, token: token, user: { phone: user.phone, balance: user.balance } });
        }
        return res.json({ success: false, message: "⚠️ ስልክ ወይም የይለፍ ቃል ተሳስቷል!" });
    } catch (e) { res.json({ success: false }); }
});

app.post('/register', async (req, res) => {
    let { phone, password } = req.body;
    try {
        const existing = await User.findOne({ phone: phone.trim() });
        if (existing) return res.json({ success: false, message: "❌ ይህ ስልክ ቀድሞ ተመዝግቧል!" });
        const newUser = new User({ phone: phone.trim(), password: password.trim(), balance: 0.00 });
        await newUser.save(); res.json({ success: true, message: "✅ ምዝገባዎ ተጠናቋል!" });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/user-balance/:phone', requireUser, async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.params.phone.trim() });
        res.json({ success: true, balance: user ? user.balance : 0 });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/place-bet', requireUser, async (req, res) => {
    let { betAmount } = req.body;
    try {
        const amount = parseFloat(betAmount);
        const result = await User.findOneAndUpdate({ phone: req.userPhone, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { new: true });
        if (!result) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });
        res.json({ success: true, newBalance: result.balance });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/deposit', requireUser, async (req, res) => {
    let { userPhone, amount, senderPhone, method, screenshot } = req.body;
    try {
        const duplicate = await Deposit.findOne({ screenshot, status: 'PENDING' });
        if (duplicate) return res.json({ success: false, message: "❌ ይህ የክፍያ ማረጋገጫ ቀድሞ ቀርቧል!" });
        const newDep = new Deposit({ id: 'DEP-' + Date.now(), userPhone: userPhone ? userPhone.trim() : req.userPhone, amount: parseFloat(amount), senderPhone, method, screenshot, status: 'PENDING' });
        await newDep.save(); res.json({ success: true, message: "✅ ጥያቄዎ በተሳካ ሁኔታ አድሚን ላይ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/withdraw', requireUser, async (req, res) => {
    try {
        const withdrawAmount = parseFloat(req.body.amount); const incomingPhone = req.body.userPhone; const finalUserPhone = incomingPhone ? incomingPhone.trim() : req.userPhone;
        const result = await User.findOneAndUpdate({ phone: finalUserPhone, balance: { $gte: withdrawAmount } }, { $inc: { balance: -withdrawAmount } }, { new: true });
        if (!result) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });
        const newWith = new Withdrawal({ id: 'WITH-' + Date.now(), userPhone: finalUserPhone, amount: withdrawAmount, accountNumber: req.body.accountNumber, fullName: req.body.fullName, method: req.body.method, status: 'PENDING' });
        await newWith.save(); res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ አድሚን ላይ ደርሷል!" });
    } catch (e) { res.json({ success: false }); }
});

app.get('/admin/users', requireAdmin, async (req, res) => { try { const list = await User.find(); res.json(list); } catch(e) { res.json(new Array()); } });
app.get('/admin/deposits', requireAdmin, async (req, res) => { try { const list = await Deposit.find().select('-screenshot').sort({ _id: -1 }); res.json(list); } catch(e) { res.json(new Array()); } });
app.get('/admin/deposit-image/:id', requireAdmin, async (req, res) => { try { const dep = await Deposit.findOne({ id: req.params.id }).select('screenshot'); if (dep) res.json({ success: true, screenshot: dep.screenshot }); else res.json({ success: false }); } catch(e) { res.json({ success: false }); } });
app.get('/admin/withdrawals', requireAdmin, async (req, res) => { try { const list = await Withdrawal.find().sort({ _id: -1 }); res.json(list); } catch(e) { res.json(new Array()); } });

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

app.post('/api/save-ticket', requireUser, async (req, res) => {
    const { ticketId, roundNumber, numbers, bet } = req.body;
    try { const newTicket = new Ticket({ ticketId, userPhone: req.userPhone, roundNumber, numbers, bet }); await newTicket.save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});
app.post('/api/save-draw', requireAdmin, async (req, res) => { try { const newDraw = new Draw(req.body); await newDraw.save(); res.json({ success: true }); } catch (e) { res.json({ success: false }); } });

mongoose.connect(config.MONGO_URI);
app.listen(config.PORT, () => { console.log(`💼 ሰርቨሩ በፖርት ${config.PORT} ላይ በአስተማማኝ ሁኔታ ተነስቷል!`); });
