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
let totalFakeBetsCount = 0;
let isBotMachineActive = false; 
let isRoundDrawingNow = false;
let botIntervalTimer = null;

function getPlayerPermanentId(phone) {
    const prefixes = ["KT", "GT", "HM", "JY", "UU", "FS", "AB", "MK", "ZR", "DN"];
    let hash = 0;
    const str = String(phone || "0911000000");
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    const absHash = Math.abs(hash);
    const prefix = prefixes[absHash % prefixes.length];
    const sixDigits = String(100000 + (absHash % 900000));
    return `${prefix}-${sixDigits}`;
}

const PERMANENT_BOT_PLAYERS = [
    "GT-194021", "HM-837210", "JY-502914", "UU-641209", "FS-391847",
    "AB-720491", "MK-318502", "ZR-904128", "DN-459203", "KT-612849",
    "GT-883104", "HM-247910", "JY-739102", "UU-510482", "FS-928371"
];

function generateFakePlayersForRound() {
    if (fakePlayersLiveBets.length === 0) {
        let numberOfFakePlayers = Math.floor(Math.random() * 3) + 3;
        const fakeAmounts = new Array(125, 150, 200, 300, 400, 500, 600, 1000, 2000, 3000);
        
        for(let i = 0; i < numberOfFakePlayers; i++) {
            let botId = PERMANENT_BOT_PLAYERS[Math.floor(Math.random() * PERMANENT_BOT_PLAYERS.length)];
            let randomBet = fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
            let fakePickedNumbers = new Array();
            while(fakePickedNumbers.length < 3) {
                let r = Math.floor(Math.random() * 80) + 1;
                if(!fakePickedNumbers.includes(r)) fakePickedNumbers.push(r);
            }
            fakePlayersLiveBets.push({
                userPhone: botId,
                bet: randomBet,
                numbers: fakePickedNumbers.sort((a, b) => a - b),
                isFake: true
            });
        }
        totalFakeBetsCount = Math.floor(Math.random() * 120) + 180;
    }
}

function runThreeSecondBotEngine() {
    if (botIntervalTimer) clearInterval(botIntervalTimer);
    botIntervalTimer = setInterval(() => {
        if (!isBotMachineActive || isRoundDrawingNow) return;

        const fakeAmounts = new Array(125, 150, 200, 300, 400, 500, 600, 1000, 2000, 3000);
        let botId = PERMANENT_BOT_PLAYERS[Math.floor(Math.random() * PERMANENT_BOT_PLAYERS.length)];
        let randomBet = fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
        let fakePickedNumbers = new Array();
        while(fakePickedNumbers.length < 3) {
            let r = Math.floor(Math.random() * 80) + 1;
            if(!fakePickedNumbers.includes(r)) fakePickedNumbers.push(r);
        }
        fakePlayersLiveBets.unshift({
            userPhone: botId,
            bet: randomBet,
            numbers: fakePickedNumbers.sort((a, b) => a - b),
            isFake: true
        });
        if (fakePlayersLiveBets.length > 40) fakePlayersLiveBets.pop();
        totalFakeBetsCount += Math.floor(Math.random() * 180) + 95;
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
        isRoundDrawingNow = true;

        let finalNumbers = new Array();
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

            currentRoundNumber++;
            nextDrawTime = Date.now() + 76 * 1000; 

            setTimeout(() => {
                totalFakeBetsCount = 0;
                fakePlayersLiveBets = new Array();
                generateFakePlayersForRound();
                isRoundDrawingNow = false;
                nextDrawTime = Date.now() + 60 * 1000;
            }, 16000);

        } catch (err) { 
            console.error("Draw Error:", err); 
            isRoundDrawingNow = false;
        }
    }, 76 * 1000); 
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
        fakeBets: fakePlayersLiveBets,
        totalBetsCount: totalFakeBetsCount
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

app.get('/api/my-history', requireUser, async (req, res) => {
    try {
        const userTickets = await Ticket.find({ userPhone: req.userPhone }).sort({ _id: -1 }).limit(100);
        if (!userTickets || userTickets.length === 0) return res.json({ success: true, history: [] });

        const roundNumbers = [...new Set(userTickets.map(t => t.roundNumber))];
        const draws = await Draw.find({ roundNumber: { $in: roundNumbers } });
        const drawMap = {};
        draws.forEach(d => { drawMap[d.roundNumber] = d.results; });

        const groupedByRound = {};
        userTickets.forEach(t => {
            if (!groupedByRound[t.roundNumber]) {
                groupedByRound[t.roundNumber] = {
                    roundNumber: t.roundNumber,
                    drawnResults: drawMap[t.roundNumber] || null,
                    tickets: []
                };
            }
            const drawn = drawMap[t.roundNumber] || [];
            const hitNumbers = drawn.length > 0 ? t.numbers.filter(n => drawn.includes(n)) : [];
            let winAmount = 0;
            if (drawn.length > 0) {
                const pickedCount = t.numbers.length;
                const hitCount = hitNumbers.length;
                if (KENO_PAYOUT_ODDS[pickedCount] && KENO_PAYOUT_ODDS[pickedCount][hitCount]) {
                    const rawWin = t.bet * KENO_PAYOUT_ODDS[pickedCount][hitCount];
                    winAmount = rawWin > 30000 ? 30000 : rawWin;
                }
            }
            groupedByRound[t.roundNumber].tickets.push({
                ticketId: t.ticketId,
                bet: t.bet,
                numbers: t.numbers,
                hitNumbers: hitNumbers,
                winAmount: winAmount,
                isFinished: drawn.length > 0
            });
        });

        const sortedRounds = Object.values(groupedByRound).sort((a, b) => b.roundNumber - a.roundNumber);
        res.json({ success: true, history: sortedRounds });
    } catch (e) {
        res.json({ success: false, history: [] });
    }
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

        const ticketId = getPlayerPermanentId(req.userPhone);
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
// ================= ✈️ AVIATOR LIVE ENGINE & BOT SYSTEM =================

let customAviatorCrashPoint = null;
let aviatorPhase = 'WAITING'; // 'WAITING', 'FLYING', 'CRASHED'
let aviatorMultiplier = 1.00;
let aviatorCrashTarget = 2.00;
let aviatorRoundId = 5001;
let aviatorWaitCountdown = 8;
let aviatorHistory = [1.45, 3.82, 1.12, 12.40, 2.15, 1.89, 5.60, 1.04, 4.10, 2.75, 19.20, 1.33];
let aviatorActiveBets = []; // { betId, playerId, userPhone, bet, panel, cashedOut, cashOutMultiplier, winAmount, isFake, targetCashOut }

function generateAviatorCrashPoint() {
    if (customAviatorCrashPoint && customAviatorCrashPoint >= 1.00) {
        const locked = parseFloat(customAviatorCrashPoint);
        customAviatorCrashPoint = null;
        return locked;
    }
    const r = Math.random();
    if (r < 0.04) return 1.00; // 4% ዕድል በ 1.00x እንዲፈነዳ
    const raw = 0.96 / (1 - r);
    const capped = Math.min(raw, 100.00);
    return Math.max(1.01, parseFloat(capped.toFixed(2)));
}

function spawnAviatorFakePlayers() {
    aviatorActiveBets = aviatorActiveBets.filter(b => !b.isFake);
    const botAmounts =;
    const numBots = Math.floor(Math.random() * 8) + 12; // ከ 12 እስከ 20 ቦቶች
    for (let i = 0; i < numBots; i++) {
        const botId = PERMANENT_BOT_PLAYERS[Math.floor(Math.random() * PERMANENT_BOT_PLAYERS.length)];
        const betAmt = botAmounts[Math.floor(Math.random() * botAmounts.length)];
        const targetMult = parseFloat((1.20 + Math.random() * 4.5).toFixed(2));
        aviatorActiveBets.push({
            betId: 'AV-BOT-' + Date.now() + '-' + i,
            playerId: botId,
            userPhone: botId,
            bet: betAmt,
            panel: 1,
            cashedOut: false,
            cashOutMultiplier: 0,
            winAmount: 0,
            isFake: true,
            targetCashOut: targetMult
        });
    }
}

function startAviatorGameLoop() {
    aviatorPhase = 'WAITING';
    aviatorWaitCountdown = 8;
    aviatorMultiplier = 1.00;
    spawnAviatorFakePlayers();

    let flightStartTime = 0;

    setInterval(() => {
        if (aviatorPhase === 'WAITING') {
            aviatorWaitCountdown -= 0.1;
            if (aviatorWaitCountdown <= 0) {
                aviatorPhase = 'FLYING';
                aviatorMultiplier = 1.00;
                aviatorCrashTarget = generateAviatorCrashPoint();
                flightStartTime = Date.now();
            }
        } else if (aviatorPhase === 'FLYING') {
            const elapsedSec = (Date.now() - flightStartTime) / 1000;
            aviatorMultiplier = parseFloat(Math.pow(Math.E, 0.095 * elapsedSec).toFixed(2));

            // ቦቶች ዒላማቸው ላይ ሲደርሱ በራሳቸው Cash Out ያደርጋሉ
            aviatorActiveBets.forEach(b => {
                if (b.isFake && !b.cashedOut && aviatorMultiplier >= b.targetCashOut) {
                    b.cashedOut = true;
                    b.cashOutMultiplier = b.targetCashOut;
                    b.winAmount = parseFloat((b.bet * b.targetCashOut).toFixed(2));
                }
            });

            if (aviatorMultiplier >= aviatorCrashTarget) {
                aviatorMultiplier = aviatorCrashTarget;
                aviatorPhase = 'CRASHED';
                aviatorHistory.unshift(aviatorCrashTarget);
                if (aviatorHistory.length > 25) aviatorHistory.pop();

                setTimeout(() => {
                    aviatorRoundId++;
                    aviatorPhase = 'WAITING';
                    aviatorWaitCountdown = 8;
                    aviatorMultiplier = 1.00;
                    spawnAviatorFakePlayers();
                }, 3500);
            }
        }
    }, 100);
}
// --- ✈️ AVIATOR USER & ADMIN APIs ---

app.get('/api/aviator-status', (req, res) => {
    const publicBets = aviatorActiveBets.map(b => ({
        betId: b.betId,
        playerId: b.playerId,
        bet: b.bet,
        panel: b.panel,
        cashedOut: b.cashedOut,
        cashOutMultiplier: b.cashOutMultiplier,
        winAmount: b.winAmount,
        isFake: b.isFake
    }));

    res.json({
        success: true,
        roundId: aviatorRoundId,
        phase: aviatorPhase,
        multiplier: aviatorMultiplier,
        waitCountdown: Math.max(0, parseFloat(aviatorWaitCountdown.toFixed(1))),
        history: aviatorHistory,
        bets: publicBets
    });
});

app.post('/api/aviator-bet', requireUser, async (req, res) => {
    const { betAmount, panel } = req.body;
    const amount = parseFloat(betAmount);
    const panelNum = Number(panel) === 2 ? 2 : 1;

    if (aviatorPhase !== 'WAITING') {
        return res.json({ success: false, message: "⚠️ ጨዋታው ተጀምሯል! ለቀጣዩ ዙር ይጠብቁ።" });
    }
    if (!amount || amount < 1 || isNaN(amount)) {
        return res.json({ success: false, message: "❌ ትክክለኛ የብር መጠን ያስገቡ (ቢያንስ 1 ETB)!" });
    }

    const alreadyBet = aviatorActiveBets.find(b => !b.isFake && b.userPhone === req.userPhone && b.panel === panelNum);
    if (alreadyBet) {
        return res.json({ success: false, message: "⚠️ በዚህ ሳጥን ላይ ቀድመው ተወራርደዋል!" });
    }

    try {
        const user = await User.findOneAndUpdate(
            { phone: req.userPhone, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { new: true }
        );
        if (!user) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });

        const betId = 'AV-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const playerId = getPlayerPermanentId(req.userPhone);

        aviatorActiveBets.unshift({
            betId,
            playerId,
            userPhone: req.userPhone,
            bet: amount,
            panel: panelNum,
            cashedOut: false,
            cashOutMultiplier: 0,
            winAmount: 0,
            isFake: false
        });

        res.json({ success: true, newBalance: user.balance, betId, playerId });
    } catch (e) {
        res.json({ success: false, message: "❌ ውርርዱን ማስቀመጥ አልተቻለም!" });
    }
});

app.post('/api/aviator-cashout', requireUser, async (req, res) => {
    const { betId } = req.body;

    if (aviatorPhase !== 'FLYING') {
        return res.json({ success: false, message: "💥 አውሮፕላኑ ቀድሞ በሯል (Flew Away)!" });
    }

    const betObj = aviatorActiveBets.find(b => !b.isFake && b.betId === betId && b.userPhone === req.userPhone);
    if (!betObj) {
        return res.json({ success: false, message: "❌ ትኬቱ አልተገኘም!" });
    }
    if (betObj.cashedOut) {
        return res.json({ success: false, message: "⚠️ ቀድመው Cash Out አድርገዋል!" });
    }

    const currentMult = aviatorMultiplier;
    if (currentMult >= aviatorCrashTarget) {
        return res.json({ success: false, message: "💥 አውሮፕላኑ ቀድሞ በሯል!" });
    }

    betObj.cashedOut = true;
    betObj.cashOutMultiplier = currentMult;
    const rawWin = betObj.bet * currentMult;
    const finalWin = parseFloat((rawWin > 50000 ? 50000 : rawWin).toFixed(2));
    betObj.winAmount = finalWin;

    try {
        const updatedUser = await User.findOneAndUpdate(
            { phone: req.userPhone },
            { $inc: { balance: finalWin } },
            { new: true }
        );
        res.json({
            success: true,
            winAmount: finalWin,
            multiplier: currentMult,
            newBalance: updatedUser ? updatedUser.balance : 0
        });
    } catch (e) {
        res.json({ success: false, message: "❌ ክፍያውን ማስገባት አልተቻለም!" });
    }
});

app.post('/admin/set-aviator-crash', requireAdmin, (req, res) => {
    const val = parseFloat(req.body.crashPoint);
    if (!val || val < 1.00 || val > 500) {
        return res.json({ success: false, message: "❌ እባክዎ ከ 1.00 እስከ 500.00 ያለ ቁጥር ያስገቡ!" });
    }
    customAviatorCrashPoint = val;
    res.json({ success: true, message: `🟢 ቀጣዩ Aviator በ ${val.toFixed(2)}x ላይ እንዲፈነዳ ተቆልፏል!` });
});

mongoose.connect(config.MONGO_URI).then(() => {
    console.log("✅ ከ MongoDB ዳታቤዝ ጋር በተሳካ ሁኔታ ተገናኝቷል!");
    startKenoGameLoop();
    app.listen(config.PORT, () => { console.log(`💼 ሰርቨሩ በፖርት ${config.PORT} ላይ በአስተማማኝ ሁኔታ ተነስቷል!`); });
}).catch(err => console.error("❌ የዳታቤዝ ግንኙነት ስህተት:", err));
