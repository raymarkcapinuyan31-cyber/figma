# HomeFixSolution - Complete Project Documentation

*Project Type:* Service Request Management Platform  
*Purpose:* Connect customers with technicians for device repair, managed by admin  
*Started:* January 6, 2026  
*Status:* Database Design Phase ✅  
*Last Updated:* January 6, 2026

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [User Roles & Features](#user-roles--features)
4. [Complete Request Flow](#complete-request-flow)
5. [Business Rules & Logic](#business-rules--logic)
6. [Database Structure (Firebase)](#database-structure-firebase)
7. [What We've Completed](#what-weve-completed)
8. [Next Steps Roadmap](#next-steps-roadmap)
9. [Credentials & Configuration](#credentials--configuration)
10. [How to Continue in New Chat](#how-to-continue-in-new-chat)

---

## 1. Project Overview

### The Problem
Customers need device repairs but don't have easy access to reliable technicians. HomeFixSolution connects them through a managed platform.

### The Solution
A platform with three user types:
- *Customers:* Submit repair requests and track their devices
- *Technicians:* Accept jobs, perform repairs, update status
- *Admins:* Monitor the entire system, manage users

### Key Features
- Request submission with device details and preferred timing
- First-come-first-served technician assignment
- Multi-phase repair workflow (Inspection → Approval → Working → Pickup)
- Real-time status tracking
- Push and in-app notifications
- Physical HQ location for device drop-off
- Cash payment on pickup/delivery

---

## 2. Technology Stack

### Mobile Application (Android)
- *Language:* Kotlin
- *UI:* XML Layouts
- *Architecture:* MVVM (Model-View-ViewModel)
- *IDE:* Android Studio Otter 2 Feature Drop | 2025.2.2 Patch 1
- *Minimum SDK:* API 21 (Android 5.0)
- *Target SDK:* API 31 (Android 12)
- *Networking:* Retrofit2 (for API calls)
- *Authentication:* Firebase Auth via API
- *Partner:* Building frontend UI

### Backend API
- *Runtime:* Node.js
- *Framework:* Express.js
- *Editor:* VS Code
- *Authentication:* JWT + Firebase Auth
- *Image Storage:* Local server uploads folder (Firebase Storage requires paid plan)
- *Email:* Nodemailer (for verification emails)

### Database
- *Service:* Firebase Firestore (NoSQL)
- *Authentication:* Firebase Authentication
- *Plan:* Free Spark Plan
- *Reason for Firebase:* Easier for beginners, real-time capabilities, no server management

### Web Application (Future)
- *Frontend:* HTML, CSS, JavaScript, PHP (reusing old project)
- *Backend:* Same Node.js API as mobile
- *Database:* Same Firebase database

---

## 3. User Roles & Features

### A. Customer (Green Theme)

*Authentication:*
- Login (Email + Password)
- Create Account (Email, Name, Password, Optional Phone)
- Email verification required

*Home Page Features:*
1. *Book a Request*
   - Input: Device type/name
   - Input: Issue description
   - Input: Detailed description
   - Input: Priority level (low, normal, high, urgent)
   - Input: Service location address
   - Input: Preferred timing/schedule
   - Optional: Media attachments (photos)

2. *My Requests (3 Tabs)*
   - *Pending:* Unaccepted requests
   - *Confirmed:* In-progress requests (showing current phase)
   - *History:* Canceled or finished requests

3. *Settings*
   - Account Info (editable: name, phone, address)
   - About Page
   - Logout

*Capabilities:*
- Submit multiple requests simultaneously
- View technician info after request acceptance
- Cancel requests (with restrictions based on phase)
- Approve/reject inspection reports
- Choose pickup or delivery method
- Track request status through phases

*Cancellation Rules:*
- ✅ *Before hand-off:* Can cancel with reason note (auto-approved, tech notified)
- ✅ *During inspection:* Can cancel, must contact tech for device return
- ❌ *During working phase:* CANNOT cancel (repair in progress)

---

### B. Technician (Dark Blue Theme)

*Authentication:*
- Login only (Accounts created by Admin)

*Home Page Features:*
1. *Request List*
   - View all pending requests from all customers
   - "Accept/Check" button for each request
   - First-come-first-served assignment

2. *Accepted Requests*
   - List of active jobs assigned to this technician
   - Status indicators showing current phase
   - "Check Info" pages that adapt based on phase:
     - *Inspection Phase:* Submit report, cost, ETA
     - *Working Phase:* Mark as done
     - *Pickup Phase:* Confirm pickup/delivery

3. *Settings*
   - Account Info
   - Availability Status Toggle:
     - Available
     - Unavailable
     - On Duty
     - Off Duty
     - On Leave
     - Vacation
   - History Requests (archived completed jobs)
   - About Page
   - Logout

*Capabilities:*
- Accept multiple requests (no limit)
- View customer contact details after acceptance
- Update availability status (for admin monitoring)
- Submit inspection reports with pricing
- Mark repairs as complete
- Communicate with customers via contact info

---

### C. Admin (Dark Blue/Hexagon Theme)

*Authentication:*
- Login to Admin Dashboard

*Admin Dashboard Features:*
1. *Request List (3 Tabs)*
   - *Pending:* Unassigned requests
   - *Confirmed:* Assigned/active requests
   - *History:* Archived requests (canceled/finished)

2. *Technician List*
   - Table view of all technicians
   - Columns: Name, Status Indicator, Specialization, Active Jobs
   - Actions:
     - "Check" button (view details)
     - "Edit" button (modify tech info)
     - "+Account" button (register new technician)
   - Can archive/ban technician accounts

3. *Settings*
   - Account Info
   - History Requests (all archived requests)
   - About Page
   - Logout

*Capabilities:*
- *Monitor only* - Cannot intervene in request flow
- View all requests and user details
- Create technician accounts
- Edit technician information
- View technician availability status
- Archive/ban problematic users
- Access user contact information
- View system-wide statistics

*Cannot Do:*
- Assign technicians to requests (techs self-select)
- Edit request information
- Force-cancel requests (TBD - might add later)

---

## 4. Complete Request Flow

### End-to-End Lifecycle

┌─────────────────────────────────────────────────────────────────┐
│                    REQUEST LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────┘

1. SUBMISSION PHASE
   Customer submits request → Appears in global Request List
   Status: "pending"
   
2. ACCEPTANCE PHASE
   Technician accepts (first-come-first-served)
   → Customer notified
   → Customer can see tech info/contact
   Status: "accepted"
   
3. HAND-OFF PHASE
   Customer chooses:
   - Give Device to HQ (physical office)
   - OR Send to Tech's address
   
   Customer can still CANCEL here (with reason note)
   
4. INSPECTION PHASE
   Tech clicks "Device Received"
   → Request moves to Inspection
   Tech performs inspection and provides:
   - Inspection Report (text description)
   - Payment Price (estimated cost)
   - ETA (completion date/time)
   Status: "inspection"
   
5. APPROVAL PHASE
   Customer receives inspection report
   Customer must choose:
   - ACCEPT → Proceed to repair
   - CANCEL → Return device (contact tech)
   
   If customer accepts → Status: "approved"
   
6. WORKING PHASE
   Tech begins repair work
   CANNOT CANCEL during this phase
   Tech clicks "Done" when repair complete
   Status: "working" → "completed"
   
7. PICKUP PHASE
   Customer chooses:
   - Pickup at HQ (no extra fee)
   - Delivery (fixed additional fee)
   
   Customer MUST PAY to receive device
   Payment method: Cash on pickup/delivery
   Money goes directly to technician
   Status: "pickup" → "finished"
   
8. COMPLETED
   Request archived to History
   Status: "finished", isArchived: true

---

## 5. Business Rules & Logic

### Request Assignment
- *Method:* First-come-first-served (tech self-selects)
- *Conflict:* If multiple techs try to accept simultaneously, first one succeeds
- *Failed Acceptance:* Other techs get error "Already accepted" or "Failed to accept"
- *Admin Role:* Monitor only, cannot assign

### Cancellation Logic

*Phase:* Before Hand-off
- ✅ Allowed
- ✅ Must provide reason note
- ✅ Auto-approved (no admin review)
- ✅ Technician notified of cancellation

*Phase:* During Inspection
- ✅ Allowed
- ⚠️ Must contact tech to retrieve device
- ✅ Auto-approved

*Phase:* During Working
- ❌ NOT allowed
- Repair already in progress

### Payment Flow
1. Tech completes repair → marks as "Done"
2. Customer chooses pickup/delivery method
3. *Customer MUST pay* to receive fixed device
4. Payment method: *Cash only* (on pickup or delivery)
5. Payment recipient: *Technician directly* (at HQ)
6. If customer doesn't pay: Device stays at HQ

### HQ (Headquarters)
- *What:* Physical office location for device repairs
- *Managed by:* Admin/Manager
- *Services:*
  - Device drop-off point
  - Repair workspace for technicians
  - Device pickup location
  - Delivery service (for additional fee)

### Delivery Service
- *Provider:* HQ provides delivery service
- *Fee:* Fixed amount (set in system config)
- *Added to:* Final payment (estimated cost + delivery fee)
- *Who delivers:* HQ staff (not individual technician)

### Notifications

*Triggers:*
- Request accepted by technician
- Device received by technician
- Inspection report ready
- Request approved by customer
- Repair completed
- Ready for pickup
- Request canceled

*Delivery Methods:*
- Push notifications (mobile app)
- In-app notification badge/list

### Multiple Requests
- ✅ *Customer:* Can have multiple pending requests (unlimited)
- ✅ *Technician:* Can work on multiple jobs simultaneously (unlimited)
- No limits implemented

### Technician Availability Status
- *Purpose:* For admin monitoring only
- *Status Options:* Available, Unavailable, On Duty, Off Duty, On Leave, Vacation
- *Effect on Requests:* None - techs can still accept requests regardless of status
- *Visibility:* Admin can see all tech statuses

### Device Tracking
- Customer sees current *phase* of request
- Phases indicate device location/status:
  - Pending: Not yet accepted
  - Accepted: Being arranged
  - Inspection: At HQ, being inspected
  - Working: Being repaired
  - Pickup: Ready for collection
  - Finished: Returned to customer

### Inspection Report
- *Contents:*
  - Text description of issue
  - Parts needed (if applicable)
  - Estimated repair cost
  - Estimated completion date/time
- *No media files* (Firebase Storage requires paid plan)
- *Negotiation:* Customer can contact tech to discuss pricing

### ETA (Estimated Time)
- *Purpose:* Inform customer when repair will be done
- *Format:* Date and time
- *Not tracked:* No countdown timer in system
- *Used for:* Customer planning only

---

## 6. Database Structure (Firebase)

### Firestore Collections

#### *users/*
{
  userId: "auto-id",
  email: "user@example.com",
  name: "John Doe",
  password: "hashed",
  phone: "+639123456789",
  role: "customer" | "technician" | "admin",
  isVerified: true,
  verificationToken: null,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp
}

#### *technicians/*
{
  technicianId: "auto-id",
  userId: "ref-to-users",
  specialization: "Electronics",
  availabilityStatus: "available",
  contactInfo: {
    phone: "+639123456789",
    address: "123 Tech St"
  },
  stats: {
    totalJobs: 0,
    completedJobs: 0,
    activeJobs: 0
  },
  createdAt: timestamp,
  updatedAt: timestamp
}

#### *requests/*
{
  requestId: "auto-id",
  customerId: "ref",
  customerInfo: { name, email, phone },
  
  // Request details
  deviceType: "Laptop",
  issue: "Screen broken",
  description: "Detailed description...",
  priority: "high",
  location: "Customer address",
  preferredSchedule: timestamp,
  
  // Status tracking
  status: "pending",
  currentPhase: "submission",
  
  // Technician
  assignedTechnicianId: null,
  technicianInfo: null,
  acceptedAt: null,
  
  // Phases
  deviceHandoffMethod: null,
  deviceReceivedAt: null,
  inspectionReport: null,
  estimatedCost: null,
  eta: null,
  customerApprovedAt: null,
  workStartedAt: null,
  workCompletedAt: null,
  pickupMethod: null,
  deliveryFee: 0,
  actualCost: null,
  paidAt: null,
  finishedAt: null,
  
  // Admin & notes
  adminNotes: null,
  technicianNotes: null,
  
  // Cancellation
  isCanceled: false,
  canceledBy: null,
  cancellationReason: null,
  canceledAt: null,
  
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
}

#### *notifications/*
{
  notificationId: "auto-id",
  userId: "ref",
  title: "Request Accepted",
  message: "Tech John accepted your request",
  type: "request_accepted",
  relatedRequestId: "ref",
  isRead: false,
  isPushSent: false,
  createdAt: timestamp
}

#### *request_cancellations/*
{
  cancellationId: "auto-id",
  requestId: "ref",
  customerId: "ref",
  reason: "Customer reason text",
  phase: "handoff",
  status: "approved",
  createdAt: timestamp
}

#### *system_config/settings*
{
  deliveryFee: 100,
  hqAddress: "HQ address",
  hqContactNumber: "+639123456789",
  businessHours: {
    weekday: "9AM-6PM",
    weekend: "10AM-4PM"
  }
}

---

## 7. What We've Completed

### Environment Setup
- ✅ Android Studio 2025 installed and configured
- ✅ VS Code installed for backend development
- ✅ Node.js installed with npm
- ✅ Real device connected (Samsung SM-F707U)
- ✅ Firebase project created: HomeFixSolution
- ✅ Firebase Authentication enabled
- ✅ Firestore Database enabled
- ✅ Firebase configuration obtained
- ✅ Service account key downloaded

### Project Structure
- ✅ homefix-api folder created
- ✅ Node.js project initialized
- ✅ Dependencies installed:
  - express, cors, dotenv
  - firebase-admin
  - bcrypt, jsonwebtoken
  - multer, nodemailer
  - nodemon (dev)

### Database Design
- ✅ Complete Firestore schema designed
- ✅ Collections planned: users, technicians, requests, notifications, cancellations
- ✅ Security rules drafted
- ✅ Indexes identified

### Business Logic
- ✅ Complete request workflow defined
- ✅ All business rules documented
- ✅ Cancellation logic clarified
- ✅ Payment flow established
- ✅ HQ operations defined

---

## 8. Next Steps Roadmap

### Phase 1: Backend API Development (Current)
*Status:* 🔄 In Progress

#### Step 1: Firebase Connection Test ⏳
- Create firebase.js config file
- Test connection to Firestore
- Verify read/write access

#### Step 2: Authentication Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/verify-email
- Email verification with Nodemailer

#### Step 3: Customer Endpoints
- POST /api/customer/request (create request)
- GET /api/customer/requests (get customer's requests)
- PUT /api/customer/request/:id/cancel (cancel request)
- PUT /api/customer/request/:id/approve (approve inspection)
- PUT /api/customer/request/:id/pickup (choose pickup method)

#### Step 4: Technician Endpoints
- GET /api/technician/requests/pending (view all pending)
- POST /api/technician/request/:id/accept (accept request)
- PUT /api/technician/request/:id/receive (mark device received)
- PUT /api/technician/request/:id/inspect (submit inspection report)
- PUT /api/technician/request/:id/complete (mark repair done)
- PUT /api/technician/availability (update status)

#### Step 5: Admin Endpoints
- GET /api/admin/requests (all requests with filters)
- GET /api/admin/technicians (all technicians)
- POST /api/admin/technician (create tech account)
- PUT /api/admin/technician/:id (edit tech info)
- PUT /api/admin/user/:id/archive (ban user)
- GET /api/admin/dashboard (statistics)

#### Step 6: Notification System
- Create notification on phase changes
- Push notification integration (later)
- In-app notification queries

#### Step 7: Image Upload
- POST /api/upload (multer middleware)
- Store in uploads/ folder
- Return image URLs

#### Step 8: Testing
- Test all endpoints with Postman
- Verify Firebase security rules
- Test concurrent tech acceptance
Mark Angelo
---

### Phase 2: Android App Integration (Partner)
*Status:* ⏸️ Waiting for backend completion

- Partner implements UI based on flowcharts
- Retrofit integration with API
- Firebase Auth SDK integration
- Image upload functionality
- Push notification setup
- Testing on real device

---

### Phase 3: Web Application Development (You)
*Status:* ⏸️ Future

- Reuse old HTML/CSS/JavaScript/PHP project
- Clear old assets
- Integrate with same API
- Shared Firebase database
- Responsive design for desktop

---

### Phase 4: Additional Features (Future)
*Status:* ⏸️ Optional

- Forgot password functionality
- Chat system (customer-admin or customer-tech)
- Rating & review system
- Request status history tracking
- Payment integration (online)
- Reports & analytics
- Real-time chat with Socket.io
- Firebase Cloud Storage (if upgraded to Blaze)

---

## 9. Credentials & Configuration

### Firebase Project
Project Name: HomeFixSolution
Project ID: homefixsolution
Region: asia-southeast1 (or asia-east1)
Plan: Spark (Free)

### Firebase Services Enabled
- ✅ Authentication (Email/Password)
- ✅ Firestore Database
- ❌ Storage (requires Blaze plan - using Node.js uploads folder instead)

### Environment Variables (.env)
env
PORT=3000
FIREBASE_DATABASE_URL=https://homefixsolution.firebaseio.com
JWT_SECRET=homefix_secret_key_2026_change_in_production

### Important Files
- serviceAccountKey.json - Firebase admin credentials (KEEP SECRET!)
- .env - Environment configuration (KEEP SECRET!)
- package.json - Node.js dependencies

### Gmail Configuration (For Email Verification)
- *Account:* Your Gmail account
- *App Password:* (To be set up)
- *Used for:* Sending verification emails to new customers

---

## 10. How to Continue in New Chat

### Quick Context for Next Claude Chat

Copy and paste this:

I'm building HomeFixSolution - a repair service management platform.

**Tech Stack:**
- Android App: Kotlin + XML + MVVM (partner building frontend)
- Backend API: Node.js + Express + Firebase Firestore (me)
- Web App: HTML/CSS/JS/PHP (me, later)
- Database: Firebase Firestore (NoSQL)

**User Roles:**
1. Customer (submit repair requests)
2. Technician (accept & complete repairs)
3. Admin (monitor system)

**Current Status:**
- ✅ Firebase project created & configured
- ✅ Node.js project initialized
- ✅ Complete database schema designed
- ✅ Business logic fully documented
- 🔄 Building backend API endpoints

**Request Flow:**
Submission → Tech Accepts → Hand-off → Inspection → Customer Approves → Working → Pickup → Completed

**Key Business Rules:**
- First-come-first-served tech assignment
- Auto-approved cancellations (with restrictions)
- Cash payment on pickup/delivery
- Physical HQ for device repairs
- No admin intervention in request flow

**Next Step:** Build API endpoints for [specify which: auth/customer/technician/admin]

**Project Files Location:**
- Backend: C:\Users\johne\Documents\Marco Programs\homefixsolution\homefix-api\
- serviceAccountKey.json present
- .env configured

Please help me continue from [current step].

---

## 📊 Project Statistics

- *Planning Days:* 1
- *Collections:* 6
- *User Roles:* 3
- *Request Phases:* 8
- *API Endpoints:* ~20
- *Technologies:* 10+

---

## 🎯 Success Criteria

*MVP (Minimum Viable Product):*
- ✅ All 3 user roles functional
- ✅ Complete request lifecycle working
- ✅ Notifications system operational
- ✅ Mobile app + Web app both working
- ✅ Same database, same API
