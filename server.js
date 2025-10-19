
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { stringify } = require('csv-stringify/sync');

const app = express();
app.use(cors());
app.use(express.json());

// Basic loan calculation (annuity)
function monthlyPayment(principal, annualRatePct, months) {
  const r = (annualRatePct / 100) / 12;
  if (r === 0) return principal / months;
  const payment = principal * (r / (1 - Math.pow(1 + r, -months)));
  return payment;
}

function amortizationSchedule(principal, annualRatePct, months) {
  const schedule = [];
  let balance = principal;
  const monthlyRate = (annualRatePct / 100) / 12;
  const payment = monthlyPayment(principal, annualRatePct, months);
  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    const principalPaid = Math.min(payment - interest, balance);
    const ending = balance - principalPaid;
    schedule.push({
      month: i,
      payment: Number(payment.toFixed(2)),
      principalPaid: Number(principalPaid.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      balance: Number(ending.toFixed(2))
    });
    balance = ending;
    if (balance <= 0) break;
  }
  return schedule;
}

app.post('/api/calculate', (req, res) => {
  const { principal, annualRatePct, months } = req.body;
  if (!principal || !months || annualRatePct === undefined) {
    return res.status(400).json({ error: 'principal, annualRatePct and months are required' });
  }
  const monthly = monthlyPayment(Number(principal), Number(annualRatePct), Number(months));
  const schedule = amortizationSchedule(Number(principal), Number(annualRatePct), Number(months));
  const totalPayment = schedule.reduce((s, row) => s + row.payment, 0);
  const totalInterest = schedule.reduce((s, row) => s + row.interest, 0);
  res.json({
    monthlyPayment: Number(monthly.toFixed(2)),
    totalPayment: Number(totalPayment.toFixed(2)),
    totalInterest: Number(totalInterest.toFixed(2)),
    schedule
  });
});

// CSV download of schedule
app.post('/api/schedule-csv', (req, res) => {
  const { principal, annualRatePct, months } = req.body;
  const schedule = amortizationSchedule(Number(principal), Number(annualRatePct), Number(months));
  const csv = stringify(schedule, { header: true, columns: { month: 'month', payment: 'payment', principalPaid: 'principalPaid', interest: 'interest', balance: 'balance' } });
  res.setHeader('Content-disposition', 'attachment; filename=amortization.csv');
  res.set('Content-Type', 'text/csv');
  res.send(csv);
});

// Generate ticket QR (returns data URL)
// The QR encodes a JSON payload with minimal ticket info for demo purposes
app.post('/api/generate-ticket', async (req, res) => {
  const { name, amount, reference } = req.body;
  if (!name || !amount) {
    return res.status(400).json({ error: 'name and amount are required' });
  }
  const payload = {
    provider: 'ComiOnline',
    name,
    amount,
    reference: reference || ('C' + Date.now())
  };
  try {
    const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), { margin: 1, width: 400 });
    res.json({ qrDataUrl: dataUrl, payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server listening on', PORT));
