# Zting Chat Backend

> Node.js backend for **Zting Chat**, a real-time AI chat application for Web and Mobile.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-real--time-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)

## Overview

This repository contains the REST API and Socket.io server for Zting Chat. It provides authentication, user and friendship management, one-to-one and group conversations, real-time messaging, media uploads, AI assistant integration, email notifications, and scheduled background jobs.

## 🔗 Related Repositories

- [ZTING_Chat_Web](https://github.com/drvictor2512/ZTING_Chat_Web) - React web client
- [ZTING_Chat_APP](https://github.com/drvictor2512/ZTING_Chat_APP) - React Native and Expo mobile client

## ✨ Key Features

- 💬 Real-time one-to-one and group chat with Socket.io
- 🤖 AI assistant powered by Google Gemini API
- 🔐 JWT authentication with Bcrypt password hashing
- 📁 Multipart media handling with Multer
- ☁️ Image and file storage through AWS S3
- ✉️ Email notifications through Resend
- ⏰ Scheduled background tasks with Cron
- 🗄️ MongoDB persistence through Mongoose

## Tech Stack

- Node.js and Express.js
- Socket.io
- MongoDB and Mongoose
- JWT and Bcrypt
- Multer and AWS SDK
- Google Gemini API through `@google/genai`
- Resend, Cron, CORS, and Dotenv

## Project Structure

```text
src/
├── application/       # Application use cases
├── infrastructure/    # Shared infrastructure libraries
├── presentation/      # HTTP and Socket.io interfaces
├── repository/        # Mongoose repositories
├── services/          # AI, auth, chat, friend, mail, and user services
└── shared/            # Shared errors and utilities
```

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- MongoDB or MongoDB Atlas
- AWS S3 credentials
- Google Gemini API key
- Resend API key and verified sender address

### Installation

```bash
git clone https://github.com/drvictor2512/ChatApp-Backend.git
cd ChatApp-Backend
npm install
```

Create a `.env` file using the variable names expected by `src/server.js` and the related services. Typical configuration includes:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_google_gemini_api_key
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=your_aws_region
AWS_S3_BUCKET=your_s3_bucket_name
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=your_verified_sender_address
```

Never commit `.env` files or production credentials.

### Run the Server

```bash
npm start
```

The development server uses Nodemon and is expected to run on `http://localhost:5000` unless configured otherwise.

## Client Configuration

Configure the Web and Mobile clients with the backend's reachable HTTP and Socket.io base URL. A physical mobile device must use the host computer's LAN address instead of `localhost`.

## License

A license has not been specified yet. Add a license file before distributing this software publicly.
