# 🏥 ApexHMS — Backend API Documentation

A multi-tenant Hospital Management System built with **Node.js + Express**, **Prisma ORM**, and **Neon PostgreSQL**.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authentication](#2-authentication)
3. [Auth Routes](#3-auth-routes--apiauth)
4. [Hospital Routes](#4-hospital-routes--apihospitals)
5. [Patient Routes](#5-patient-routes--apipatients)
6. [Staff Routes](#6-staff-routes--apistaff)
7. [Appointment Routes](#7-appointment-routes--apiappointments)
8. [Prescription Routes](#8-prescription-routes--apiprescriptions)
9. [Medical Record Routes](#9-medical-record-routes--apimedical-records)
10. [Billing Routes](#10-billing-routes--apibilling)
11. [Admission Routes](#11-admission-routes--apiadmissions)
12. [Bed Routes](#12-bed-routes--apibeds)
13. [Queue Routes](#13-queue-routes--apiqueue)
14. [Notification Routes](#14-notification-routes--apinotifications)
15. [Subscription & Payment Routes](#15-subscription--payment-routes)
16. [Super Admin Routes](#16-super-admin-routes--apiadmin)
17. [Error Handling](#17-error-handling)
18. [Database Resilience](#18-database-resilience-withretry)
19. [Transactional Email](#19-transactional-email)
20. [Environment Variables](#20-environment-variables)

---

## 1. System Overview

| Key | Value |
|-----|-------|
| **Runtime** | Node.js + Express |
| **Database** | PostgreSQL via Prisma ORM (Neon) |
| **Auth** | JWT Bearer Tokens |
| **Base URL** | `https://your-backend.com/api` |

Each hospital is an isolated tenant — its patients, staff, records, and billing are fully scoped to that hospital.

### Architecture

- Express.js router per resource (`auth`, `patients`, `staff`, `appointments`, etc.)
- Prisma ORM with `withRetry()` wrapper to handle Neon cold-start timeouts
- JWT authentication — 24h tokens for admins, 12h for staff, 7d for patients
- Role-based access control enforced per route via middleware
- Nodemailer for transactional email (credentials, resets, payment proofs)
- Neon keep-alive ping every 4 minutes in `server.js` to prevent connection drops

### User Roles

| Role | JWT Claim | Description |
|------|-----------|-------------|
| `super_admin` | `super_admin` | Platform-level access. Can approve hospitals, manage subscriptions. |
| `hospital_admin` | `hospital_admin` | Full access to their hospital. Manages staff, patients, billing. |
| `doctor` | `doctor` | Can view patients, create appointments, prescriptions, and records. |
| `nurse` | `nurse` | Can view patients, appointments, and add medical records. |
| `pharmacist` | `pharmacist` | Can view and dispense (complete) prescriptions. |
| `lab_staff` | `lab_staff` | Can view patients and add lab result records. |
| `receptionist` | `receptionist` | Can manage appointments, billing, admissions, queue, and lab requests. |
| `patient` | `patient` | Can view their own records, appointments, and prescriptions. |

---

## 2. Authentication

All protected endpoints require a JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens encode `{ id, hospital_id, role }` and do **not** auto-refresh — the client must re-login on expiry.

### Middleware

| Middleware | What it does |
|------------|-------------|
| `verifyToken` | Validates JWT. Attaches `req.user = { id, hospital_id, role }`. |
| `isHospitalAdmin` | Requires `role === "hospital_admin"`. |
| `isSuperAdmin` | Requires `role === "super_admin"`. |
| `belongsToHospital` | Verifies the route's `:hospitalId` matches `req.user.hospital_id`. |
| `requireRole([…])` | Accepts an array of allowed roles. Rejects all others with 403. |

### Rate Limiting

- **Login endpoints** (hospital, staff, admin): 10 requests per 15 minutes
- **Forgot password**: 5 requests per hour
- Rate limit errors return HTTP `429` with a user-friendly message.

---

## 3. Auth Routes — `/api/auth`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/auth/hospital/register` | Register a new hospital (status = pending) | Public |
| `POST` | `/auth/hospital/login` | Hospital admin login | Public 🔒 Rate limited |
| `POST` | `/auth/hospital/forgot-password` | Send 6-digit reset code to hospital email | Public 🔒 Rate limited |
| `POST` | `/auth/hospital/reset-password` | Reset hospital password using OTP code | Public |
| `POST` | `/auth/staff/login` | Staff / doctor login | Public 🔒 Rate limited |
| `POST` | `/auth/staff/forgot-password` | Staff password reset (stub — returns success) | Public |
| `POST` | `/auth/patient/login` | Patient portal login | Public |
| `POST` | `/auth/change-password` | Change own password (all roles) | 🔐 JWT required |
| `POST` | `/auth/admin/login` | Super admin login | Public 🔒 Rate limited |
| `GET` | `/auth/me` | Get current user profile | 🔐 JWT required |

---

### POST `/api/auth/hospital/register`

Registers a new hospital. Status is set to `pending` and requires super admin approval before login.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hospitalName` | string | ✓ | Full legal name of the hospital |
| `hospitalType` | string | ✓ | `public` \| `private` \| `specialty` \| `clinic` \| `medical_center` |
| `address` | string | ✓ | Physical address |
| `phone` | string | ✓ | Contact phone number |
| `email` | string | ✓ | Hospital admin email (unique) |
| `licenseNumber` | string | ✓ | Government-issued license (unique) |
| `adminName` | string | ✓ | Name of the hospital administrator |
| `password` | string | ✓ | Min 8 characters |

**Response**
```json
{ "message": "Registration successful! Awaiting admin approval." }
```

> Returns `409` if email or license number already exists. Password is hashed with bcrypt (12 rounds).

---

### POST `/api/auth/hospital/login`

Authenticates a hospital admin. Checks approval status before verifying credentials. Returns JWT + subscription status.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | ✓ | Hospital admin email |
| `password` | string | ✓ | Account password |

**Response**
```json
{
  "token": "eyJhbG...",
  "subscriptionStatus": "active",
  "requiresPayment": false,
  "user": { "id": 1, "role": "hospital_admin" }
}
```

> Returns `403` if hospital status is `pending`, `suspended`, or `rejected`. Token expires in **24 hours**.

---

### POST `/api/auth/staff/login`

Authenticates hospital staff. `hospitalId` is required to scope the lookup — the same email can exist across multiple hospitals.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | string | ✓ | Staff email address |
| `password` | string | ✓ | Account password |
| `hospitalId` | integer | ✓ | Hospital the staff member belongs to |

**Response**
```json
{
  "token": "eyJhbG...",
  "user": { "id": 5, "fullName": "Dr. Jane Smith", "role": "doctor", "hospitalId": 1 }
}
```

> Token expires in **12 hours**. Returns `403` if staff status is `inactive`.

---

### POST `/api/auth/change-password`

Allows any authenticated user to change their own password. The role in the JWT determines which table is updated.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currentPassword` | string | ✓ | Must match the stored hashed password |
| `newPassword` | string | ✓ | Min 8 characters, must differ from current |

**Response**
```json
{ "message": "Password changed successfully." }
```

---

## 4. Hospital Routes — `/api/hospitals`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/hospitals/search` | Search approved hospitals by name | Public |
| `GET` | `/hospitals/stats` | Hospital-level stats (patients, appointments, etc.) | 🔐 hospital_admin |
| `GET` | `/hospitals/me` | Get current hospital profile | 🔐 hospital_admin |
| `PUT` | `/hospitals/profile` | Update hospital name, phone, address, email | 🔐 hospital_admin |

---

### GET `/api/hospitals/search?q=Lagos`

Used by the staff login page to find a hospital. Only returns hospitals with `status = "approved"`. Returns up to 10 results. Minimum 2 characters required.

**Response**
```json
{
  "hospitals": [
    { "id": 1, "hospitalName": "Lagos General", "address": "...", "phone": "..." }
  ]
}
```

---

### GET `/api/hospitals/stats`

Returns aggregate counts scoped to the requesting hospital.

**Response**
```json
{
  "stats": {
    "totalPatients": 142,
    "totalStaff": 18,
    "totalAppointments": 380,
    "todayAppointments": 7,
    "activePrescriptions": 23
  }
}
```

---

## 5. Patient Routes — `/api/patients`

Patients are registered by hospital admins. A temporary password is generated, hashed, and emailed to the patient on registration.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/patients/login` | Patient portal login | Public |
| `GET` | `/patients/detail/:id` | Get single patient by ID | 🔐 JWT required |
| `POST` | `/patients` | Register new patient + send credentials email | 🔐 hospital_admin |
| `GET` | `/patients/:hospitalId` | List all patients (supports `search` + `limit`) | 🔐 staff |
| `DELETE` | `/patients/:id` | Delete a patient record | 🔐 hospital_admin |

---

### POST `/api/patients`

Creates a new patient. Generates a unique patient number (`PAT-XXXXXX`) and temporary password. Emails credentials to the patient. Creates a notification for the hospital.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullName` | string | ✓ | Patient full name |
| `dateOfBirth` | date | ✓ | ISO date string, e.g. `"1990-05-14"` |
| `phone` | string | ✓ | Contact phone number |
| `address` | string | ✓ | Home address |
| `gender` | string | | Default: `"male"` |
| `email` | string | | If provided, credentials email is sent |
| `bloodGroup` | string | | e.g. `"A+"` |
| `medicalConditions` | string | | Pre-existing conditions |
| `nextOfKinName` | string | | Emergency contact name |
| `nextOfKinPhone` | string | | Emergency contact phone |

**Response**
```json
{
  "message": "Patient registered successfully",
  "patient": { "id": 12, "patientNumber": "PAT-847291" },
  "tempPassword": "abc12345"
}
```

> `tempPassword` is returned in the response for admin reference and also emailed to the patient. Returns `409` if email already exists.

---

### GET `/api/patients/:hospitalId`

Lists all patients for the hospital. Supports optional filtering.

**Query Parameters**

| Param | Description |
|-------|-------------|
| `search` | Case-insensitive search across name, patient number, email |
| `limit` | Limit the number of results returned |

---

## 6. Staff Routes — `/api/staff`

Hospital admins add staff members. A temporary password is generated and emailed. Staff can be activated or deactivated without deletion.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/staff/:hospitalId` | List staff (filter by `role`, search by name/email) | 🔐 staff |
| `POST` | `/staff` | Add new staff member + send credentials email | 🔐 hospital_admin |
| `PATCH` | `/staff/:id/status` | Set staff status to `active` or `inactive` | 🔐 hospital_admin |
| `DELETE` | `/staff/:id` | Permanently remove a staff member | 🔐 hospital_admin |

---

### POST `/api/staff`

Creates a new staff account with a temporary password and emails credentials. Valid roles: `doctor`, `nurse`, `pharmacist`, `lab_staff`, `receptionist`.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fullName` | string | ✓ | Full name of the staff member |
| `email` | string | ✓ | Work email — used for login (unique within hospital) |
| `role` | string | ✓ | `doctor` \| `nurse` \| `pharmacist` \| `lab_staff` \| `receptionist` |
| `department` | string | | e.g. `"Cardiology"` |
| `specialty` | string | | e.g. `"Surgeon"` (mainly for doctors) |
| `phone` | string | | Contact number |

**Response**
```json
{
  "message": "Staff member added successfully",
  "staff": { "id": 8, "fullName": "Dr. Ade", "role": "doctor" },
  "tempPassword": "xy8z4221"
}
```

> Returns `409` if email already exists in this hospital.

---

## 7. Appointment Routes — `/api/appointments`

Status flow: `scheduled` → `completed` | `cancelled` | `no_show`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/appointments/:hospitalId` | List appointments (filter by `status`) | 🔐 staff |
| `POST` | `/appointments` | Create new appointment | 🔐 doctor / receptionist / nurse |
| `PATCH` | `/appointments/:id/status` | Update appointment status | 🔐 JWT required |
| `DELETE` | `/appointments/:id` | Delete an appointment | 🔐 JWT required |

---

### POST `/api/appointments`

Books an appointment. `hospitalId` is derived from the JWT.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `patientId` | integer | ✓ | ID of the patient |
| `doctorId` | integer | ✓ | ID of the doctor |
| `appointmentDate` | date | ✓ | ISO date string, e.g. `"2025-08-15"` |
| `appointmentTime` | string | ✓ | Time string, e.g. `"14:30"` |
| `reason` | string | ✓ | Reason for the visit |
| `notes` | string | | Additional notes |

**Response**
```json
{ "message": "Appointment booked successfully.", "appointment": { "id": 34, "status": "scheduled" } }
```

---

## 8. Prescription Routes — `/api/prescriptions`

Status flow: `active` → `completed` (dispensed) | `cancelled`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/prescriptions/:hospitalId` | List prescriptions (filter by `status`, `patientId`, `doctorId`) | 🔐 staff |
| `POST` | `/prescriptions` | Issue new prescription | 🔐 doctor / hospital_admin |
| `PATCH` | `/prescriptions/:id` | Update status (`active` / `completed` / `cancelled`) | 🔐 doctor / pharmacist / hospital_admin |
| `DELETE` | `/prescriptions/:id` | Delete prescription | 🔐 hospital_admin |

---

### POST `/api/prescriptions`

Issues a prescription. Both patient and doctor are verified to belong to the requesting hospital. A notification is created on success.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `patientId` | integer | ✓ | ID of the patient |
| `doctorId` | integer | ✓ | ID of the prescribing doctor |
| `medication` | string | ✓ | Drug name and strength, e.g. `"Amoxicillin 500mg"` |
| `dosage` | string | ✓ | e.g. `"1 tablet 3× daily"` |
| `duration` | string | ✓ | e.g. `"7 days"` |
| `instructions` | string | | Special instructions |
| `refills` | integer | | Number of refills allowed (default `0`) |

---

## 9. Medical Record Routes — `/api/medical-records`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/medical-records/:hospitalId` | List records (filter by `patientId` or `recordType`) | 🔐 staff |
| `POST` | `/medical-records` | Add new medical record | 🔐 JWT required |
| `DELETE` | `/medical-records/:id` | Delete a record | 🔐 hospital_admin |

### Record Types

| Value | Description |
|-------|-------------|
| `lab_results` | Blood tests, urine tests, etc. |
| `consultation` | Doctor visit notes and diagnoses |
| `imaging` | X-ray, MRI, ultrasound reports |
| `other` | Anything that doesn't fit above |

---

### POST `/api/medical-records`

Creates a clinical record. Both patient and doctor must belong to the same hospital as the requesting user.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `patientId` | integer | ✓ | Patient this record belongs to |
| `doctorId` | integer | ✓ | Doctor authoring the record |
| `recordType` | string | ✓ | `lab_results` \| `consultation` \| `imaging` \| `other` |
| `title` | string | ✓ | Short title, e.g. `"Full Blood Count"` |
| `diagnosis` | string | | Diagnosed condition |
| `findings` | string | | Key clinical findings |
| `testResults` | object | | JSON object for structured lab results |
| `vitals` | object | | JSON object for vital signs |
| `notes` | string | | Free-text clinical notes |

---

## 10. Billing Routes — `/api/billing`

Status flow: `unpaid` → `partial` → `paid`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/billing/:hospitalId` | List invoices (filter by `status`, `search`) | 🔐 staff |
| `POST` | `/billing/:hospitalId` | Create new invoice | 🔐 staff |
| `POST` | `/billing/:id/payment` | Record a payment against an invoice | 🔐 JWT required |
| `DELETE` | `/billing/:id` | Delete an invoice | 🔐 JWT required |

---

### POST `/api/billing/:hospitalId`

Creates a new invoice. Invoice number is auto-generated (`INV-XXXXXX`). A notification is created on success.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `patientId` | integer | ✓ | Patient being billed |
| `description` | string | ✓ | What the bill is for, e.g. `"Consultation Fee"` |
| `totalAmount` | number | ✓ | Total amount owed |
| `category` | string | | e.g. `"consultation"`, `"lab"`, `"admission"` (default: `"consultation"`) |
| `items` | array | | JSON array of line items |

---

### POST `/api/billing/:id/payment`

Records a payment. Adds the amount to `amountPaid` (cumulative). Automatically updates status to `partial` or `paid`.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✓ | Amount being paid now |
| `method` | string | ✓ | e.g. `"cash"`, `"card"`, `"transfer"` |

> If `amountPaid >= totalAmount` the status is set to `"paid"` and `paidAt` is stamped.

---

## 11. Admission Routes — `/api/admissions`

When a patient is admitted to a bed, the bed status is set to `"occupied"`. On discharge, the bed is freed automatically.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/admissions/:hospitalId` | List admissions (filter by `status`, `search`) | 🔐 staff |
| `POST` | `/admissions/:hospitalId` | Admit a patient | 🔐 staff |
| `PATCH` | `/admissions/:id/discharge` | Discharge a patient, free the bed | 🔐 JWT required |
| `DELETE` | `/admissions/:id` | Delete an admission record | 🔐 JWT required |

### Field Mapping

The Prisma schema uses different field names from what the frontend expects. The API normalizes these on every response:

| Frontend key | DB field | Note |
|--------------|----------|------|
| `reason` | `admissionReason` | |
| `admissionDate` | `admittedAt` | |
| `dischargeDate` | `dischargedAt` | |
| `notes` | `dischargeNotes` | |
| `doctor` | `admittedBy` | staff relation |

---

## 12. Bed Routes — `/api/beds`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/beds/:hospitalId` | List beds (filter by `status` or `ward`) | 🔐 staff |
| `POST` | `/beds/:hospitalId` | Create a new bed | 🔐 staff |
| `PATCH` | `/beds/:id/status` | Manually update bed status | 🔐 JWT required |

**Bed Types:** `general` | `private` | `icu` | `maternity` | `pediatric` | `emergency`

**Bed Statuses:** `available` | `occupied` | `maintenance` | `reserved`

> `bedNumber` must be unique within a hospital — returns `409` on conflict.

---

## 13. Queue Routes — `/api/queue`

Walk-in queue management. Ticket numbers are auto-generated daily (`001`, `002`, ...).

Status flow: `waiting` → `called` → `in-progress` → `completed`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/queue/:hospitalId` | List queue entries (filter by `status`, `department`) | 🔐 staff |
| `POST` | `/queue/:hospitalId` | Add patient to queue | 🔐 staff |
| `PATCH` | `/queue/:id/status` | Update queue entry status | 🔐 JWT required |
| `DELETE` | `/queue/:id` | Remove from queue | 🔐 JWT required |

> **Note:** The DB stores status with underscores (`in_progress`) but the API converts to hyphens (`in-progress`) for the frontend and back again on write. `queueNumber` in the response is an alias for the DB field `ticketNumber`.

---

## 14. Notification Routes — `/api/notifications`

Notifications are created server-side when important events occur and shown in the frontend notification panel.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/notifications` | Get all notifications for current user (max 50) | 🔐 JWT required |
| `PATCH` | `/notifications/:id/read` | Mark a single notification as read | 🔐 JWT required |
| `PATCH` | `/notifications/read-all` | Mark all notifications as read | 🔐 JWT required |
| `DELETE` | `/notifications/:id` | Delete a notification | 🔐 JWT required |

### Notification Types

| Type | Trigger |
|------|---------|
| `patient_registered` | New patient added |
| `appointment_booked` | Appointment created |
| `prescription_issued` | Prescription issued |
| `patient_admitted` | Patient admitted |
| `billing_created` | New invoice created |
| `subscription_activated` | Subscription confirmed |
| `staff_added` | New staff member added |

---

## 15. Subscription & Payment Routes

Two payment flows exist: **Paystack** (auto-verified) and **bank transfer proof** (manual admin approval).

### Paystack — `/api/payments`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/payments/verify` | Verify Paystack transaction + activate subscription | 🔐 hospital_admin |
| `GET` | `/payments/subscription` | Check own subscription status | 🔐 hospital_admin |

#### POST `/api/payments/verify`

Verifies a Paystack transaction server-side — never trusts the frontend. Idempotent — safe to call twice with the same reference.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reference` | string | ✓ | Paystack transaction reference from the frontend popup |

**Response**
```json
{
  "message": "Subscription activated successfully",
  "subscription": { "plan": "professional", "status": "active", "expiresAt": "..." }
}
```

> Paystack metadata must include `planKey` (set by the frontend during checkout). Returns `402` if the transaction was not successful.

---

### Manual Proof — `/api/subscriptions`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/subscriptions/status` | Hospital checks own subscription | 🔐 hospital_admin |
| `POST` | `/subscriptions/proof` | Submit bank transfer screenshot | Public |
| `GET` | `/subscriptions/pending` | List all pending proofs | 🔐 super_admin |
| `PATCH` | `/subscriptions/:hospitalId/activate` | Activate subscription after proof verified | 🔐 super_admin |

---

## 16. Super Admin Routes — `/api/admin`

All routes require `super_admin` role in the JWT.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/hospitals` | List all hospitals with patient/staff counts |
| `PUT` | `/admin/hospitals/:id/approve` | Approve a pending hospital registration |
| `GET` | `/admin/stats` | Platform-wide statistics |

---

## 17. Error Handling

All errors are returned as JSON with an `"error"` (or `"message"`) key.

| Status | Meaning | Common Cause |
|--------|---------|-------------|
| `400` | Bad Request | Missing required fields or invalid field values |
| `401` | Unauthorized | Invalid JWT, expired token, or wrong password |
| `402` | Payment Required | Paystack transaction was not successful |
| `403` | Forbidden | Role not allowed, or hospital not approved/suspended |
| `404` | Not Found | Record not found (Prisma `P2025` error) |
| `409` | Conflict | Duplicate email, license number, bed number, etc. |
| `422` | Unprocessable | Field validation failed (contact form) |
| `429` | Too Many Requests | Rate limit hit on login or forgot-password endpoint |
| `500` | Internal Error | Unhandled exception — check server logs |
| `502` | Bad Gateway | Paystack API was unreachable |

---

## 18. Database Resilience (`withRetry`)

Neon PostgreSQL is serverless and can enter a sleep state after inactivity, causing the first query to fail. The `withRetry()` helper wraps every Prisma call to handle this automatically.

```js
async function withRetry(fn, retries = 3, delayMs = 2000) {
  // Retries on: connect, timeout, "Server has closed", P1001, P1008, P1017
  // Waits 2 seconds between attempts
  // Throws on non-connection errors immediately
}
```

`server.js` also runs a keep-alive ping every 4 minutes to reduce cold starts:

```js
setInterval(() => prisma.$queryRaw`SELECT 1`, 4 * 60 * 1000);
```

---

## 19. Transactional Email

Nodemailer with Gmail handles all outbound email. Configure these in your `.env`:

```env
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-gmail-app-password   # Gmail App Password, NOT your real password
NOTIFY_EMAIL=admin-notification@yourdomain.com
```

### Emails Sent

| Event | Module | Description |
|-------|--------|-------------|
| Patient registered | Patient registration | Sends login credentials (email + temp password) to the new patient |
| Staff added | Staff registration | Sends login credentials to the new staff member |
| Hospital password reset | Auth | Sends a 6-digit OTP code (expires in 15 min) |
| Payment proof submitted | Subscriptions/Payments | Notifies admin with screenshot attachment; confirms receipt to hospital |
| Subscription activated | Subscriptions | Notifies hospital that their plan is now active with login link |

---

## 20. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✓ | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✓ | Secret key for signing JWTs — keep long and random |
| `PORT` | | Server port (default: `5000`) |
| `NODE_ENV` | | `development` \| `production` |
| `EMAIL_USER` | ✓ | Gmail address used as sender |
| `EMAIL_PASS` | ✓ | Gmail App Password (not your real password) |
| `NOTIFY_EMAIL` | ✓ | Admin email to receive payment proof notifications |
| `PAYSTACK_SECRET_KEY` | ✓ | Paystack secret key for payment verification |
| `FRONTEND_URL` | | Used in activation email login link (default: `http://localhost:5173`) |

---

*ApexHMS Backend API — End of Documentation*