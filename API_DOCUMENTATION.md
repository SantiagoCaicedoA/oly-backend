# Oly Backend API Documentation

A comprehensive Node.js Express backend for Olympic weightlifting training management, built with MongoDB integration, AWS S3 storage, and AI-powered training generation.

## Project Structure

```
oly-backend/
├── config/
│   ├── database.js          # MongoDB connection configuration
│   └── upload.js            # AWS S3 & local file upload configuration
├── controllers/
│   ├── dailyCheckInController.js    # Daily check-in handlers
│   ├── postController.js            # Social media posts handlers
│   ├── profileController.js         # Athlete profile handlers
│   ├── setLogController.js          # Training set logging handlers
│   ├── trainingController.js        # Training week generation & logging
│   ├── userController.js            # User authentication & management
│   └── videoController.js           # Video upload & management
├── middleware/
│   ├── auth.js              # JWT authentication middleware
│   ├── errorHandler.js      # Global error handling middleware
│   └── notFound.js          # 404 handler middleware
├── models/
│   ├── AthleteProfile.js    # Athlete profile schema
│   ├── Comment.js           # Post comments schema
│   ├── Like.js              # Post likes schema
│   ├── Post.js              # Social media posts schema
│   ├── SetLog.js            # Training set logs schema
│   ├── User.js              # User & embedded profile schema
│   ├── Video.js             # Video records schema
│   └── WeeklyTraining.js    # Weekly training plans schema
├── routes/
│   ├── dailyCheckInRoutes.js # Daily check-in endpoints
│   ├── index.js             # Main routes file
│   ├── postRoutes.js        # Post management endpoints
│   ├── profileRoutes.js     # Profile management endpoints
│   ├── setLogRoutes.js      # Set logging endpoints
│   ├── trainingRoutes.js    # Training week endpoints
│   ├── userRoutes.js        # User management endpoints
│   ├── v1AuthRoutes.js      # Authentication endpoints
│   └── videoRoutes.js       # Video management endpoints
├── services/
│   ├── documentService.js   # Document processing service
│   ├── generateTrainingWeek.js # AI training week generation
│   ├── openaiService.js     # OpenAI API integration
│   └── s3Service.js         # AWS S3 file storage
├── jobs/
│   ├── dailyCompletionCron.js # Daily training completion cron
│   └── sundayTrainingCron.js   # Weekly training generation cron
├── scripts/
│   └── migrate-profile-to-user.js # Database migration script
├── utils/
│   ├── AppError.js          # Custom error class
│   ├── mergeProfile.js      # Profile merging utilities
│   ├── normalizeProfileEnums.js # Profile enum normalization
│   └── profileResponse.js   # Profile response formatting
├── .github/workflows/
│   └── deploy-ecs.yml       # AWS ECS deployment workflow
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore file
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Docker image configuration
├── package.json            # Dependencies and scripts
├── README.md               # Original README file
├── API_DOCUMENTATION.md    # This comprehensive documentation
└── server.js               # Application entry point
```

## Architecture Overview

### Layers

1. **Routes** (`routes/`)
   - Define API endpoints for authentication, users, profiles, posts, videos, training, and more
   - Handle request validation using express-validator
   - Route requests to appropriate controllers
   - Include authentication middleware where needed

2. **Controllers** (`controllers/`)
   - Handle HTTP requests and responses
   - Call services to perform business logic
   - Manage file uploads (videos, images) to AWS S3
   - Format and send responses

3. **Services** (`services/`)
   - Contain business logic including AI-powered training generation
   - Interact with models/database and external APIs (OpenAI, AWS S3)
   - Handle data transformations and document processing

4. **Models** (`models/`)
   - Define MongoDB schemas using Mongoose
   - Include User with embedded profile, Posts, Videos, Training data, Comments, Likes
   - Define data structure and validation rules

5. **Config** (`config/`)
   - Database connections and AWS S3 configuration
   - File upload handling for multipart forms

6. **Middleware** (`middleware/`)
   - JWT authentication and authorization
   - Error handling and 404 responses
   - Request logging and custom middleware functions

7. **Jobs** (`jobs/`)
   - Automated cron jobs for training generation and completion tracking
   - Sunday training week generation using AI
   - Daily training completion monitoring

## Key Features

- **User Authentication**: JWT-based signup/signin with refresh tokens
- **Athlete Profiles**: Comprehensive onboarding with strength stats, equipment, preferences
- **AI Training Generation**: OpenAI-powered weekly training plans based on athlete profiles
- **Social Features**: Posts with videos/images, likes, comments, visibility controls
- **Video Management**: AWS S3 integration for video uploads and storage
- **Training Logging**: Detailed set logging with custom exercises
- **Daily Check-ins**: Health and training status monitoring with AI adjustments
- **Automated Scheduling**: Cron jobs for training generation and completion tracking

## Setup Instructions

### Option 1: Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   - Copy `.env.example` to `.env` (create if it doesn't exist)
   - Update the following variables:
     ```
     NODE_ENV=development
     PORT=8080
     MONGODB_URI=mongodb://localhost:27017/oly-backend
     JWT_SECRET=your_jwt_secret_here
     JWT_EXPIRE=30d
     JWT_REFRESH_EXPIRE=30d
     OPENAI_API_KEY=your_openai_api_key_here
     AWS_ACCESS_KEY_ID=your_aws_access_key
     AWS_SECRET_ACCESS_KEY=your_aws_secret_key
     AWS_REGION=us-east-1
     AWS_S3_BUCKET=your_s3_bucket_name
     ```

3. **Start MongoDB**
   - Make sure MongoDB is running on your system
   - Or use Docker: `docker run -d -p 27017:27017 --name mongodb mongo:7`

4. **Run the Application**
   ```bash
   # Development mode (with nodemon)
   npm run dev

   # Production mode
   npm start
   ```

### Option 2: Docker Compose (Recommended)

1. **Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```
   This will start both the backend API and MongoDB in isolated containers.

2. **View Logs**
   ```bash
   docker-compose logs -f
   ```

3. **Stop Services**
   ```bash
   docker-compose down
   ```

### Option 3: Production Deployment

The application includes GitHub Actions workflow for automatic deployment to AWS ECS. See `.github/workflows/deploy-ecs.yml` for configuration details.

## API Endpoints

### Health Check
- `GET /api/health` - Check API status
- `GET /` - Root endpoint with API info

### Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/signup` - Create new user account
- `POST /api/v1/auth/signin` - User login (returns JWT tokens)
- `POST /api/v1/auth/refresh` - Refresh JWT tokens

### Users (`/api/users`)
- `GET /api/users` - Get all users (includes `profile` in each user)
- **`GET /api/users/me`** - **Current user + profile in one response** (auth: `x-user-id`). Use this when you need the complete user.
- `GET /api/users/:id` - Get user by ID (includes `profile`)
- **`POST /api/users` – Signup.** Only **3 fields**: `name`, `email`, `password`. Creates the user.
- `PUT /api/users/:id` - Update user by ID
- `DELETE /api/users/:id` - Delete user by ID

### Profile / Onboarding (`/api/profile`) (auth: `x-user-id` header)
Profile data is stored **inside the User document** (`user.profile`), so one read gives user + profile.
- `GET /api/profile` - Get current user's profile only
- `POST /api/profile` - Create profile (optional: `display_name`, `country`, `age`). Call once after signup.
- `PUT /api/profile` - Update profile with full onboarding data in one request. Call once on the 9th onboarding screen with all 9 screens' data.

**Flow:** **Signup** (POST /api/v1/auth/signup) → POST profile (optional) → onboarding → one PUT /api/profile with full payload. To get **complete user + profile in one call**, use **GET /api/users/me** (with `x-user-id`).

### Posts (`/api/posts`) (auth: `x-user-id` header)
Social media posts with video/image support, likes, and comments.
- `POST /api/posts` - Create new post (multipart form: video required, image optional)
- `GET /api/posts` - Get all posts (with pagination and filtering)
- `GET /api/posts/:id` - Get post by ID
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like a post
- `DELETE /api/posts/:id/like` - Unlike a post
- `POST /api/posts/:id/comments` - Add comment to post
- `GET /api/posts/:id/comments` - Get post comments
- `DELETE /api/posts/:id/comments/:commentId` - Delete comment

### Videos (`/api/videos`) (auth: `x-user-id` header)
Video management with AWS S3 integration.
- `POST /api/videos/upload` - Upload video file to S3 (returns URL)
- `POST /api/videos` - Create video record with metadata
- `GET /api/videos` - Get all videos (with filtering)
- `GET /api/videos/:id` - Get video by ID
- `PUT /api/videos/:id` - Update video
- `DELETE /api/videos/:id` - Delete video

### Training (`/api/training`) (auth: `x-user-id` header)
AI-powered training week generation and logging.
- `GET /api/training/week` - Get current training week
- `POST /api/training/generate` - Manually generate new training week
- `PATCH /api/training/log` - Log training activity (update weight/reps/completion)
- `POST /api/training/week/custom-set` - Add custom set to exercise
- `DELETE /api/training/week/custom-set` - Delete custom set

### Daily Check-ins (`/api/daily`) (auth: `x-user-id` header)
Health and training status monitoring.
- `POST /api/daily/check-in` - Submit daily check-in (may trigger AI adjustments)

### Set Logging (`/api/set-log`) (auth: `x-user-id` header)
Detailed training set logging.
- `POST /api/set-log` - Log a training set
- `GET /api/set-log` - Get set logs
- `DELETE /api/set-log/:id` - Delete set log

## Example Requests

### User Signup
```bash
POST /api/v1/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

### User Signin
```bash
POST /api/v1/auth/signin
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Create Post (with video upload)
```bash
POST /api/posts
Content-Type: multipart/form-data
Authorization: Bearer <jwt_token>

# Form fields:
# video: (file) - required video file
# image: (file) - optional image file
# data: {
#   "lift_name": "Clean & Jerk",
#   "opinion": "Felt good today!",
#   "load_lifted": 100,
#   "load_unit": "kg",
#   "visibility": ["SHARED_WITH_FRIENDS"],
#   "status": "PUBLISHED"
# }
```

### Get Current User with Profile
```bash
GET /api/users/me
x-user-id: <user_id>
```

### Update Profile (full onboarding data)
```bash
PUT /api/profile
x-user-id: <user_id>
Content-Type: application/json

{
  "display_name": "John D",
  "country": "USA",
  "age": 25,
  "sex": "Male",
  "experience_years": 3,
  "height_cm": 175,
  "bodyweight_value": 80,
  "bodyweight_unit": "kg",
  "preferred_unit": "Metric",
  "strength_stats": {
    "classic": {
      "snatch": { "value": 80, "checked": true },
      "clean_jerk": { "value": 100, "checked": true }
    }
  },
  "availability": {
    "training_days_per_week": 4,
    "session_duration": 60,
    "preferred_rest_days": ["sunday", "wednesday"]
  },
  "equipment": ["barbell", "bumper_plates", "rack"],
  "training_preference": {
    "type": "Balanced"
  }
}
```

## Data Models

### User Model
```javascript
{
  _id: ObjectId,
  name: String (required),
  username: String (unique, sparse),
  email: String (required, unique, lowercase),
  password: String (required, bcrypt hashed),
  profile: {
    profile_image_url: String,
    profile_video_urls: [String],
    display_name: String,
    country: String,
    age: Number,
    sex: enum['Male', 'Female', 'Other'],
    experience_years: Number,
    height_cm: Number,
    bodyweight_value: Number,
    bodyweight_unit: enum['kg', 'lbs'],
    preferred_unit: enum['Metric', 'Imperial'],
    strength_stats: {
      classic: {
        snatch: { value: Number, checked: Boolean },
        clean_jerk: { value: Number, checked: Boolean }
      },
      variation: {
        power_snatch: { value: Number, checked: Boolean },
        clean: { value: Number, checked: Boolean },
        power_clean: { value: Number, checked: Boolean }
      },
      squat: {
        back_squat: { value: Number, checked: Boolean },
        front_squat: { value: Number, checked: Boolean },
        overhead_squat: { value: Number, checked: Boolean }
      },
      press: {
        strict_press: { value: Number, checked: Boolean },
        push_press: { value: Number, checked: Boolean },
        power_jerk: { value: Number, checked: Boolean },
        jerk: { value: Number, checked: Boolean }
      }
    },
    strength_accuracy: enum['Tested', 'Estimated', 'Unsure'],
    considerations: {
      has_limitations: Boolean,
      affected_areas: [String],
      impact_level: enum['Mild', 'Moderate', 'High'],
      triggers: [String]
    },
    availability: {
      training_days_per_week: Number (1-6),
      session_duration: enum[45, 60, 75, 90],
      preferred_rest_days: [String]
    },
    equipment: [String],
    training_preference: {
      type: enum['High Intensity', 'Balanced', 'Higher Volume', 'Adaptive']
    },
    performance_gaps: [String]
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Post Model
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: 'User'),
  name: String,
  username: String,
  image_url: String,
  video_url: String (required),
  lift_name: String,
  opinion: String,
  session_detail: Mixed,
  load_lifted: Number,
  load_unit: enum['kg', 'lbs'],
  context: String,
  intent: String,
  effort: String,
  visibility: [enum['PRIVATE', 'SHARED_WITH_FRIENDS']],
  status: enum['DRAFT', 'PUBLISHED'],
  createdAt: Date,
  updatedAt: Date
}
```

### Video Model
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: 'User'),
  video_url: String,
  lift_name: String,
  category: String,
  reps: Number,
  // Additional metadata fields
  createdAt: Date,
  updatedAt: Date
}
```

## Adding New Features

To add a new feature (e.g., Products):

1. **Create Model**: `models/Product.js` - Define Mongoose schema
2. **Create Service**: `services/productService.js` - Business logic
3. **Create Controller**: `controllers/productController.js` - HTTP handlers
4. **Create Routes**: `routes/productRoutes.js` - API endpoints
5. **Register Routes**: Add to `routes/index.js`

## Dependencies

### Production Dependencies
- **express**: Web framework (v4.18.2)
- **mongoose**: MongoDB ODM (v8.0.3)
- **bcryptjs**: Password hashing (v3.0.3)
- **jsonwebtoken**: JWT authentication (v9.0.3)
- **dotenv**: Environment variable management (v16.6.1)
- **cors**: Cross-origin resource sharing (v2.8.5)
- **helmet**: Security middleware (v7.1.0)
- **morgan**: HTTP request logger (v1.10.0)
- **express-validator**: Request validation (v7.0.1)
- **multer**: File upload handling (v2.0.2)
- **node-cron**: Cron job scheduling (v3.0.3)
- **openai**: OpenAI API integration (v4.73.0)
- **@aws-sdk/client-s3**: AWS S3 SDK (v3.982.0)
- **pdf-parse**: PDF document parsing (v1.1.1)

### Development Dependencies
- **nodemon**: Auto-restart server during development (v3.1.11)

## Environment Variables

Required environment variables for production:

```bash
# Server Configuration
NODE_ENV=production
PORT=8080

# Database
MONGODB_URI=mongodb://localhost:27017/oly-backend

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=30d
JWT_REFRESH_EXPIRE=30d

# OpenAI Integration
OPENAI_API_KEY=your_openai_api_key_here

# AWS S3 Storage
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket_name
```

## Deployment

### Docker Deployment
```bash
# Build image
docker build -t oly-backend .

# Run container
docker run -p 8080:8080 -e NODE_ENV=production oly-backend
```

### AWS ECS Deployment
The project includes GitHub Actions workflow for automatic deployment to AWS ECS. Configure your AWS credentials and ECS cluster in GitHub repository settings.

## Cron Jobs

The application includes automated cron jobs:

1. **Sunday Training Generation** (Sundays at midnight)
   - Generates next week's training plans using AI
   - Requires `OPENAI_API_KEY` to be configured

2. **Daily Completion Check** 
   - Marks training days as complete based on time
   - Production should use `0 4 * * *` (4 AM daily)

## Frontend Integration

This backend is designed to work with React Native Expo frontend. Key integration points:

- **Authentication**: Use JWT tokens returned from `/api/v1/auth/signin`
- **File Uploads**: Send multipart form data to `/api/posts` and `/api/videos/upload`
- **User Context**: Include `token` header for authenticated requests
- **Profile Data**: User profile is embedded in user document for efficiency
- **Real-time Updates**: Training weeks are generated automatically on Sundays

## Authentication Flow

1. **Signup**: `POST /api/v1/auth/signup` with name, email, password
2. **Signin**: `POST /api/v1/auth/signin` with email, password → returns JWT tokens
3. **Authenticated Requests**: Include `x-user-id` header with user ID
4. **Token Refresh**: `POST /api/v1/auth/refresh` to get new tokens

## File Upload Guidelines

- **Videos**: Max 100MB, supported formats: MP4, MOV, AVI
- **Images**: Max 10MB, supported formats: JPEG, PNG, GIF
- **Storage**: Files are uploaded to AWS S3, URLs returned in response
- **Local Testing**: Files stored in `/uploads/images` directory when S3 not configured

## Error Handling

All API responses follow consistent format:
```javascript
// Success Response
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}

// Error Response
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "fieldName",
      "message": "Specific error message"
    }
  ]
}
```

## License

ISC
