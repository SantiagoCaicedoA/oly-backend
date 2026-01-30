# Oly Backend API

A well-structured Node.js Express backend application with MongoDB integration.

## Project Structure

```
oly backend/
├── config/
│   └── database.js          # MongoDB connection configuration
├── controllers/
│   └── userController.js    # Request handlers (business logic coordination)
├── middleware/
│   ├── errorHandler.js      # Global error handling middleware
│   └── notFound.js          # 404 handler middleware
├── models/
│   └── User.js              # MongoDB Mongoose schemas
├── routes/
│   ├── index.js             # Main routes file
│   └── userRoutes.js        # User-specific routes
├── services/
│   └── userService.js       # Business logic layer
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore file
├── package.json            # Dependencies and scripts
├── README.md               # This file
└── server.js               # Application entry point
```

## Architecture Overview

### Layers

1. **Routes** (`routes/`)
   - Define API endpoints
   - Handle request validation
   - Route requests to appropriate controllers

2. **Controllers** (`controllers/`)
   - Handle HTTP requests and responses
   - Call services to perform business logic
   - Format and send responses

3. **Services** (`services/`)
   - Contain business logic
   - Interact with models/database
   - Handle data transformations

4. **Models** (`models/`)
   - Define MongoDB schemas using Mongoose
   - Define data structure and validation rules

5. **Config** (`config/`)
   - Database connections
   - Application configuration

6. **Middleware** (`middleware/`)
   - Error handling
   - Authentication/authorization
   - Request logging
   - Custom middleware functions

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   - Copy `.env.example` to `.env`
   - Update the MongoDB URI and other configuration values

3. **Start MongoDB**
   - Make sure MongoDB is running on your system
   - Update `MONGODB_URI` in `.env` if needed

4. **Run the Application**
   ```bash
   # Development mode (with nodemon)
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Health Check
- `GET /api/health` - Check API status

### Users / Signup
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- **`POST /api/users` – Signup.** Only **3 fields**: `name`, `email`, `password`. Creates the user.
- `PUT /api/users/:id` - Update user by ID
- `DELETE /api/users/:id` - Delete user by ID

### Profile / Onboarding (auth: `x-user-id` header)
- `GET /api/profile` - Get current user's profile
- `POST /api/profile` - Create profile (optional: `display_name`, `country`, `age`). Call once after signup.
- `PUT /api/profile` - Update profile with full onboarding data in one request. Call once on the 9th onboarding screen with all 9 screens' data.

**Flow:** **Signup** (POST /api/users with `name`, `email`, `password`) → POST profile (optional initial fields) → onboarding screens 1–9 (no API calls) → on 9th screen → one PUT /api/profile with full payload.

## Example Request

### Signup (create user)
Only **name**, **email**, and **password** are accepted.
```bash
POST /api/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

## Adding New Features

To add a new feature (e.g., Products):

1. **Create Model**: `models/Product.js`
2. **Create Service**: `services/productService.js`
3. **Create Controller**: `controllers/productController.js`
4. **Create Routes**: `routes/productRoutes.js`
5. **Register Routes**: Add to `routes/index.js`

## Dependencies

- **express**: Web framework
- **mongoose**: MongoDB ODM
- **dotenv**: Environment variable management
- **cors**: Cross-origin resource sharing
- **helmet**: Security middleware
- **morgan**: HTTP request logger
- **express-validator**: Request validation

## Development Dependencies

- **nodemon**: Auto-restart server during development

## License

ISC
