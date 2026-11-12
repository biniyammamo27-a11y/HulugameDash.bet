// models.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0.00 }
});

const DepositSchema = new mongoose.Schema({
    id: String,
    userPhone: { type: String, index: true },
    amount: Number,
    senderPhone: String,
    method: String,
    screenshot: String,
    status: { type: String, default: 'PENDING' },
    date: { type: String, default: () => new Date().toLocaleString('am-ET') }
});

const WithdrawalSchema = new mongoose.Schema({
    id: String,
    userPhone: { type: String, index: true },
    amount: Number,
    accountNumber: String,
    fullName: String,
    method: String,
    status: { type: String, default: 'PENDING' },
    date: { type: String, default: () => new Date().toLocaleString('am-ET') }
});

const DrawSchema = new mongoose.Schema({ roundNumber: Number, results: [Number], date: { type: Date, default: Date.now } });

const TicketSchema = new mongoose.Schema({
    ticketId: String,
    userPhone: { type: String, index: true },
    roundNumber: Number,
    numbers: [Number],
    bet: Number,
    date: { type: Date, default: Date.now }
});

module.exports = {
    User: mongoose.model('User', UserSchema),
    Deposit: mongoose.model('Deposit', DepositSchema),
    Withdrawal: mongoose.model('Withdrawal', WithdrawalSchema),
    Draw: mongoose.model('Draw', DrawSchema),
    Ticket: mongoose.model('Ticket', TicketSchema)
};
