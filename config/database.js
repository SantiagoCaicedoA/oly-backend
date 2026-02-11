const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    console.error(
      'Error: MONGODB_URI is not set. When running with Docker, use "docker compose up" (so MongoDB + URI are set), or run the image with -e MONGODB_URI=mongodb://host:27017/oly-backend'
    );
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
