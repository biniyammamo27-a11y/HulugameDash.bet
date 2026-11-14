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
let latestDrawResults = [];   
let fakePlayersLiveBets = []; 
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
        const fakeAmounts =;
        
        for(let i = 0; i < numberOfFakePlayers; i++) {
            let botId = PERMANENT_BOT_PLAYERS[Math.floor(Math.random() * PERMANENT_BOT_PLAYERS.length)];
            let randomBet = fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
            let fakePickedNumbers = [];
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

        const fakeAmounts =;
        let botId = PERMANENT_BOT_PLAYERS[Math.floor(Math.random() * PERMANENT_BOT_PLAYERS.length)];
        let randomBet = fakeAmounts[Math.floor(Math.random() * fakeAmounts.length)];
        let fakePickedNumbers = [];
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

            currentRoundNumber++;
            nextDrawTime = Date.now() + 76 * 1000; 

            setTimeout(() => {
                totalFakeBetsCount = 0;
                fakePlayersLiveBets = [];
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
// ================= 🌐 HTML & AUTH ROUTES =================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Dashbet3.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));
app.get('/admin', requireAdminPage, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.post('/admin-auth', (req, res) => {
    const { password } = req.body;
    if (password === config.ADMIN_PASSWORD) {
        const token = jwt.sign({ role: 'admin' }, config.JWT_SECRET, { expiresIn: '12h' });
        res.cookie('adminToken', token, { httpOnly: true, maxAge: 12 * 3600 * 1000 });
        return res.json({ success: true, token });
    }
    res.json({ success: false, message: "❌ የተሳሳተ የአድሚን የይለፍ ቃል!" });
});

app.post('/register', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, message: "⚠️ እባክዎ ሁሉንም ቦታዎች ይሙሉ!" });
    try {
        const cleanPhone = String(phone).trim();
        const existingUser = await User.findOne({ phone: cleanPhone });
        if (existingUser) return res.json({ success: false, message: "⚠️ ይህ ስልክ ቁጥር ቀድሞ ተመዝግቧል!" });
        const hashedPassword = await bcrypt.hash(String(password), 10);
        const newUser = new User({ phone: cleanPhone, password: hashedPassword, balance: 0.00 });
        await newUser.save();
        res.json({ success: true, message: "✅ በተሳካ ሁኔታ ተመዝግበዋል! አሁን ይግቡ።" });
    } catch (err) { res.json({ success: false, message: "❌ የምዝገባ ስህተት ተፈጥሯል!" }); }
});

app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    try {
        const cleanPhone = String(phone || "").trim();
        const user = await User.findOne({ phone: cleanPhone });
        if (!user) return res.json({ success: false, message: "❌ ስልክ ቁጥር ወይም የይለፍ ቃል ተሳስቷል!" });

        let isMatch = false;
        if (user.password && user.password.startsWith('$2')) {
            isMatch = await bcrypt.compare(String(password), user.password);
        } else {
            isMatch = (user.password === String(password));
            if (isMatch) {
                user.password = await bcrypt.hash(String(password), 10);
                await user.save();
            }
        }
        if (!isMatch) return res.json({ success: false, message: "❌ ስልክ ቁጥር ወይም የይለፍ ቃል ተሳስቷል!" });

        const token = jwt.sign({ phone: user.phone }, config.JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, user: { phone: user.phone, balance: user.balance } });
    } catch (err) { res.json({ success: false, message: "❌ የሰርቨር ስህተት ተፈጥሯል!" }); }
});

app.get('/api/my-balance', requireUser, async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.userPhone });
        if (!user) return res.json({ success: false });
        res.json({ success: true, balance: user.balance });
    } catch (e) { res.json({ success: false }); }
});

// ================= 💰 WALLET APIs =================

app.post('/api/deposit', requireUser, async (req, res) => {
    const { amount, senderPhone, method, screenshot } = req.body;
    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount <= 0 || isNaN(depositAmount) || !senderPhone) {
        return res.json({ success: false, message: "❌ ትክክለኛ የብር መጠን እና ስልክ ቁጥር ያስገቡ!" });
    }
    try {
        const newDep = new Deposit({
            id: 'DEP-' + Date.now(),
            userPhone: req.userPhone,
            amount: depositAmount,
            senderPhone: String(senderPhone).trim(),
            method,
            screenshot: screenshot || "",
            status: 'PENDING',
            date: new Date().toLocaleString()
        });
        await newDep.save();
        res.json({ success: true, message: "✅ የዲፖዚት ጥያቄዎ እና ደረሰኝዎ ለአድሚን ተልኳል! በጥቂት ደቂቃዎች ውስጥ ይጸድቃል።" });
    } catch (err) { res.json({ success: false, message: "❌ ጥያቄውን መላክ አልተቻለም!" }); }
});

app.post('/api/withdraw', requireUser, async (req, res) => {
    const { amount, accountNumber, fullName, method } = req.body;
    const withdrawAmount = parseFloat(amount);
    if (!withdrawAmount || withdrawAmount <= 0 || isNaN(withdrawAmount) || !accountNumber || !fullName) {
        return res.json({ success: false, message: "❌ እባክዎ ትክክለኛ መረጃ ያስገቡ!" });
    }
    try {
        const user = await User.findOneAndUpdate(
            { phone: req.userPhone, balance: { $gte: withdrawAmount } },
            { $inc: { balance: -withdrawAmount } },
            { new: true }
        );
        if (!user) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });

        const newWith = new Withdrawal({
            id: 'WITH-' + Date.now(),
            userPhone: req.userPhone,
            amount: withdrawAmount,
            accountNumber: String(accountNumber).trim(),
            fullName: String(fullName).trim(),
            method,
            status: 'PENDING',
            date: new Date().toLocaleString()
        });
        await newWith.save();
        res.json({ success: true, message: "✅ የዊዝድሮው ጥያቄዎ ተልኳል! በጥቂት ደቂቃዎች ውስጥ ወደ ሂሳብዎ ይገባል።" });
    } catch (err) { res.json({ success: false, message: "❌ ስህተት ተፈጥሯል!" }); }
});

// ================= 🎰 KENO GAME APIs =================

app.get('/api/keno-status', (req, res) => {
    const timeLeft = Math.max(0, Math.floor((nextDrawTime - Date.now()) / 1000));
    res.json({
        success: true,
        roundNumber: currentRoundNumber,
        timeLeft: timeLeft,
        latestResults: latestDrawResults,
        fakeBets: fakePlayersLiveBets,
        totalBetsCount: totalFakeBetsCount
    });
});

app.get('/api/draw-history', async (req, res) => {
    try {
        const history = await Draw.find().sort({ _id: -1 }).limit(15);
        res.json(history.reverse());
    } catch (err) { res.json(new Array()); }
});

app.get('/api/my-history', requireUser, async (req, res) => {
    try {
        const userTickets = await Ticket.find({ userPhone: req.userPhone }).sort({ _id: -1 }).limit(40);
        const roundNumbers = [...new Set(userTickets.map(t => t.roundNumber))];
        const draws = await Draw.find({ roundNumber: { $in: roundNumbers } });

        const drawMap = {};
        draws.forEach(d => { drawMap[d.roundNumber] = d.results; });

        const grouped = {};
        userTickets.forEach(t => {
            if (!grouped[t.roundNumber]) {
                grouped[t.roundNumber] = {
                    roundNumber: t.roundNumber,
                    tickets: new Array()
                };
            }
            const results = drawMap[t.roundNumber] || null;
            const hitNumbers = results ? t.numbers.filter(n => results.includes(n)) : new Array();
            let winAmount = 0;
            if (results) {
                const pickedCount = [...new Set(t.numbers)].length;
                const matchedCount = hitNumbers.length;
                if (KENO_PAYOUT_ODDS[pickedCount] && KENO_PAYOUT_ODDS[pickedCount][matchedCount]) {
                    const rawWin = t.bet * KENO_PAYOUT_ODDS[pickedCount][matchedCount];
                    winAmount = rawWin > 30000 ? 30000 : rawWin;
                }
            }

            grouped[t.roundNumber].tickets.push({
                ticketId: t.ticketId,
                bet: t.bet,
                numbers: t.numbers,
                hitNumbers: hitNumbers,
                winAmount: winAmount,
                isFinished: Boolean(results)
            });
        });

        const sortedHistory = Object.values(grouped).sort((a, b) => b.roundNumber - a.roundNumber);
        res.json({ success: true, history: sortedHistory });
    } catch (e) {
        res.json({ success: false, history: new Array() });
    }
});

app.post('/api/place-bet', requireUser, async (req, res) => {
    const { betAmount, numbers } = req.body;
    const bet = parseFloat(betAmount);
    if (!bet || bet <= 0 || isNaN(bet)) return res.json({ success: false, message: "❌ ትክክለኛ የብር መጠን ያስገቡ!" });
    if (!Array.isArray(numbers) || numbers.length < 1 || numbers.length > 10) return res.json({ success: false, message: "❌ እባክዎ ከ 1 እስከ 10 ቁጥሮች ይምረጡ!" });

    try {
        const user = await User.findOneAndUpdate(
            { phone: req.userPhone, balance: { $gte: bet } },
            { $inc: { balance: -bet } },
            { new: true }
        );
        if (!user) return res.json({ success: false, message: "❌ በቂ ቀሪ ሂሳብ የሎትም!" });

        const playerPermanentId = getPlayerPermanentId(req.userPhone);
        const newTicket = new Ticket({
            ticketId: playerPermanentId,
            userPhone: req.userPhone,
            roundNumber: currentRoundNumber,
            numbers: numbers.map(Number),
            bet: bet
        });
        await newTicket.save();

        res.json({ success: true, newBalance: user.balance, ticketId: playerPermanentId });
    } catch (err) { res.json({ success: false, message: "❌ ውርርዱን ማስቀመጥ አልተቻለም!" }); }
});

app.get('/admin/bot-status', requireAdmin, (req, res) => {
    res.json({ success: true, isBotActive: isBotMachineActive });
});

app.post('/admin/toggle-bot', requireAdmin, (req, res) => {
    const { activate } = req.body;
    isBotMachineActive = Boolean(activate);
    res.json({
        success: true,
        isBotActive: isBotMachineActive,
        message: isBotMachineActive ? "🟢 የ3 ሰከንድ ቦት ማሽን በተሳካ ሁኔታ ተጀምሯል!" : "🔴 የ3 ሰከንድ ቦት ማሽን ሙሉ በሙሉ ቆሟል!"
    });
});
// ================= 🛡️ ADMIN PANEL APIs =================

app.get('/admin/users', requireAdmin, async (req, res) => {
    try { 
        const users = await User.find({}, { password: 0 }).sort({ _id: -1 }); 
        res.json(users); 
    } catch (e) { res.json(new Array()); }
});

app.get('/admin/deposits', requireAdmin, async (req, res) => {
    try { 
        const deps = await Deposit.find({}, { screenshot: 0 }).sort({ _id: -1 }).limit(100); 
        res.json(deps); 
    } catch (e) { res.json(new Array()); }
});

app.get('/admin/deposit-image/:id', requireAdmin, async (req, res) => {
    try {
        const dep = await Deposit.findOne({ id: req.params.id }, { screenshot: 1 });
        if (!dep) return res.json({ success: false });
        res.json({ success: true, screenshot: dep.screenshot });
    } catch (e) { res.json({ success: false }); }
});

app.get('/admin/withdrawals', requireAdmin, async (req, res) => {
    try { 
        const withs = await Withdrawal.find().sort({ _id: -1 }).limit(100); 
        res.json(withs); 
    } catch (e) { res.json(new Array()); }
});

app.post('/admin/approve-deposit', requireAdmin, async (req, res) => {
    const { id, userPhone, amount } = req.body;
    try {
        const dep = await Deposit.findOneAndUpdate({ id, status: 'PENDING' }, { status: 'APPROVED' }, { new: true });
        if (!dep) return res.json({ success: false });
        await User.findOneAndUpdate({ phone: userPhone }, { $inc: { balance: parseFloat(amount) } });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/reject-deposit', requireAdmin, async (req, res) => {
    try {
        await Deposit.findOneAndUpdate({ id: req.body.id, status: 'PENDING' }, { status: 'REJECTED' });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/approve-withdraw', requireAdmin, async (req, res) => {
    try {
        await Withdrawal.findOneAndUpdate({ id: req.body.id, status: 'PENDING' }, { status: 'APPROVED' });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/reject-withdraw', requireAdmin, async (req, res) => {
    try {
        const w = await Withdrawal.findOneAndUpdate({ id: req.body.id, status: 'PENDING' }, { status: 'REJECTED' }, { new: true });
        if (w) await User.findOneAndUpdate({ phone: w.userPhone }, { $inc: { balance: w.amount } });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/admin/set-keno-numbers', requireAdmin, (req, res) => {
    const { numbers } = req.body;
    if (!Array.isArray(numbers) || numbers.length !== 20) return res.json({ success: false, message: "❌ በትክክል 20 ቁጥሮች መምረጥ አለብዎት!" });
    customKenoNumbers = numbers.map(Number);
    res.json({ success: true, message: "🟢 20ዎቹ ቁጥሮች ለቀጣዩ እጣ በተሳካ ሁኔታ ተቆልፈዋል!" });
});
// ================= ✈️ AVIATOR LIVE ENGINE & BOT SYSTEM =================

let customAviatorCrashPoint = null;
let aviatorPhase = 'WAITING'; // 'WAITING', 'FLYING', 'CRASHED'
let aviatorMultiplier = 1.00;
let aviatorCrashTarget = 2.00;
let aviatorRoundId = 5001;
let aviatorWaitCountdown = 8;
let aviatorHistory = new Array(1.45, 3.82, 1.12, 12.40, 2.15, 1.89, 5.60, 1.04, 4.10, 2.75, 19.20, 1.33);
let aviatorActiveBets = [];

function generateAviatorCrashPoint() {
    if (customAviatorCrashPoint && customAviatorCrashPoint >= 1.00) {
        const locked = parseFloat(customAviatorCrashPoint);
        customAviatorCrashPoint = null;
        return locked;
    }
    const r = Math.random();
    if (r < 0.04) return 1.00;
    const raw = 0.96 / (1 - r);
    const capped = Math.min(raw, 100.00);
    return Math.max(1.01, parseFloat(capped.toFixed(2)));
}

function spawnAviatorFakePlayers() {
    aviatorActiveBets = [];
    const botAmounts = new Array(20, 50, 100, 150, 200, 300, 500, 1000, 1500, 2500);
    const numBots = Math.floor(Math.random() * 8) + 12;
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

// ================= 🚀 START SERVER & DATABASE =================

mongoose.connect(config.MONGO_URI).then(() => {
    console.log("✅ ከ MongoDB ዳታቤዝ ጋር በተሳካ ሁኔታ ተገናኝቷል!");
    startKenoGameLoop();
    startAviatorGameLoop();
    app.listen(config.PORT, () => { console.log(`💼 ሰርቨሩ በፖርት ${config.PORT} ላይ በአስተማማኝ ሁኔታ ተነስቷል!`); });
}).catch(err => console.error("❌ የዳታቤዝ ግንኙነት ስህተት:", err));
