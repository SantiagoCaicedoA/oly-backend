require('dotenv').config();
const mongoose = require('mongoose');
const WeeklyTraining = require('./models/WeeklyTraining');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const doc = await WeeklyTraining.findOne().sort({ _id: -1 }).lean();
    console.log('Days monday:', doc.days.monday.daily_check_in);
    process.exit();
}
test();
