# Security Specifications: Clinical Psychology Practice Backend

## 1. Data Invariants & Access Control Matrices

| Collection | Create | Read/Get | List | Update | Delete | Required Validators / Invariants |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/patients` | **Clinician Only** | **Clinician Only** | **Clinician Only** | **Clinician Only** | **Clinician Only** | `ownerId == request.auth.uid` |
| `/histories` | **Clinician Only** | **Clinician Only** | **Clinician Only** | **Clinician Only** | **Clinician Only** | Clinician only. Patients strictly denied. `ownerId == request.auth.uid` |
| `/settings` | **Clinician Only**| **Clinician Only** | **Clinician Only** | **Clinician Only** | **Clinician Only** | `ownerId == request.auth.uid`, `updatedAt == request.time` |
| `/appointments` | **Public** | **Public Single** | **Clinician Only** | **Clinician/Public** | **Clinician Only** | Relational integrity. Clinician can update anything. Public can only update specific action fields (e.g., payment checkout, cancel). No public list. |

---

## 2. The "Dirty Dozen" Malicious Payloads

The following 12 payloads represent attempts by bad actors to hijack the database, bypass clinical security, or leak HIPAA/private data.

### 1. The HIPAA Snooper (Case File Leak Attack)
*   **Target**: `/histories/some_clinical_note_123`
*   **Attack**: Anonymous user attempts to read sensitive psychotherapeutic patient process notes.
*   **Malicious Payload**: `GET /histories/some_clinical_note_123` (Auth: Null)
*   **Security Barrier**: Mandate `request.auth != null` and `resource.data.ownerId == request.auth.uid` (Patients have no login, the clinical account must own it).

### 2. Clinical History Spoof (Doctor Identity Theft)
*   **Target**: `/histories/fake_note`
*   **Attack**: Non-owner clinician or patient attempts to insert a medical note on behalf of doctor ID `dr_real`.
*   **Malicious Payload**:
    ```json
    {
      "patientId": "patient_bob",
      "notes": "Patient is cured.",
      "ownerId": "dr_real"
    }
    ```
    *(Authorized under auth.uid = "attacker_uid")*
*   **Security Barrier**: Enforce `incoming().ownerId == request.auth.uid`.

### 3. Patient Dossier Harvesting (List Scraping)
*   **Target**: `/patients`
*   **Attack**: Attacker attempts to list all existing patients list to gather private contact details (PII leak).
*   **Malicious Payload**: `LIST /patients` (Auth: Attacker UID)
*   **Security Barrier**: `allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid;`

### 4. Shadow Field Injection (Settings Hijack)
*   **Target**: `/settings/dr_real_uid`
*   **Attack**: Attacker sets professional settings but adds a ghost field `superAdmin: true` to bypass administrative limits in case of client parsing vulnerabilities.
*   **Malicious Payload**:
    ```json
    {
      "therapistName": "Dr. Real",
      "ownerId": "dr_real_uid",
      "superAdmin": true
    }
    ```
*   **Security Barrier**: Strict size and strict schema check during create/update via `affectedKeys().hasOnly(['therapistName', 'contactEmail', 'contactPhone', 'sessionPrice', 'whatsappReminders', 'emailReminders', 'updatedAt', 'ownerId'])`.

### 5. Denial-of-Wallet Path Variable Attack
*   **Target**: `/appointments/JUNK_CHARACTER_KEY_SPAM_` (10KB long junk string)
*   **Attack**: Triggering firestore resource leaks by injecting massive paths or invalid patterns.
*   **Malicious Payload**: `CREATE /appointments/<10KB String>`
*   **Security Barrier**: Path variable validation: `isValidId(appointmentId)` matching `^[a-zA-Z0-9_\-]+$` and length `<= 128`.

### 6. Booking Collusion (Pre-empting Slots without Paying)
*   **Target**: `/appointments/appt_999`
*   **Attack**: External user attempts to force appointment payment states to `paid` without triggering the Stripe webhook interface.
*   **Malicious Payload**:
    ```json
    {
      "patientName": "Scammer",
      "patientEmail": "scam@web.com",
      "date": "2026-06-01",
      "timeSlot": "10:00 - 11:00",
      "status": "scheduled",
      "paymentStatus": "paid",
      "ownerId": "dr_real_uid"
    }
    ```
*   **Security Barrier**: Public creation can only write `paymentStatus == 'pending'`. The `paid` state is locked strictly behind therapist signature or strict relational state transit.

### 7. Price Poisoning (Consulting for $0 USD)
*   **Target**: `/appointments/appt_101`
*   **Attack**: Public patient sets the price field to negative numbers to bypass checkout values.
*   **Malicious Payload**:
    ```json
    {
      "patientName": "Cheap Client",
      "patientEmail": "cheap@web.com",
      "date": "2026-06-01",
      "timeSlot": "10:00 - 11:00",
      "status": "scheduled",
      "paymentStatus": "pending",
      "price": -500.0,
      "ownerId": "dr_real_uid"
    }
    ```
*   **Security Barrier**: `price is number && price >= 0` inside `isValidAppointment` validator.

### 8. Backdated Booking (Temporal Anachronism)
*   **Target**: `/appointments/appt_old`
*   **Attack**: Booking sessions with a custom `createdAt` representing 2012 to bypass therapist validation loops.
*   **Malicious Payload**:
    ```json
    {
      "patientName": "Bob",
      "patientEmail": "bob@web.com",
      "date": "2026-06-01",
      "timeSlot": "10:00 - 11:00",
      "status": "scheduled",
      "paymentStatus": "pending",
      "ownerId": "dr_real_uid",
      "createdAt": "2012-10-10T12:00:00Z"
    }
    ```
*   **Security Barrier**: Enforce temporal integrity: `incoming().createdAt == request.time`.

### 9. Clinical History Mutability Erasure
*   **Target**: `/histories/session_456`
*   **Attack**: Clinician or compromised agent tries to rewrite `createdAt` is a therapy document.
*   **Malicious Payload**:
    ```json
    {
      "patientId": "patient_id",
      "notes": "Corrected note content...",
      "createdAt": "1999-01-01T00:00:00Z"
    }
    ```
*   **Security Barrier**: Immutability gate: `incoming().createdAt == existing().createdAt`.

### 10. Hijack Appointment Host (Clinician Theft)
*   **Target**: `/appointments/appt_77a`
*   **Attack**: Re-assigning an already scheduled booking to a competitor's therapist ID.
*   **Malicious Payload**:
    ```json
    {
      "ownerId": "the_enemy_therapist_uid"
    }
    ```
*   **Security Barrier**: Absolute immutability of `ownerId` once set: `incoming().ownerId == existing().ownerId`.

### 11. Self-Assigned Role Escalation
*   **Target**: `/settings/attacker_uid`
*   **Attack**: User sets random configuration keys trying to trick internal router claims to bypass credential paths.
*   **Malicious Payload**:
    ```json
    {
      "therapistName": "Hacker",
      "role": "administrator",
      "ownerId": "attacker_uid"
    }
    ```
*   **Security Barrier**: Strict key set block. No custom properties permitted outside settings blueprint.

### 12. Public List Leaks
*   **Target**: `/appointments`
*   **Attack**: Attacker lists appointment data to find who else is seeing the psychologist at what times, causing high HIPAA confidentiality violation.
*   **Malicious Payload**: `LIST /appointments` (Auth: Null / External)
*   **Security Barrier**: Mandate therapist role checking for multi-document listing: `allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid`.

---

## 3. Security Rules Tests Outline

Visual verification of these blocks is automatically managed during rules compilation. The firestore rules must mathematically prevent any of these "Dirty Dozen" payloads.
