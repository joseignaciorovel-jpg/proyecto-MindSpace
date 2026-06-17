import { Timestamp } from "firebase/firestore";

export interface Patient {
  id: string;
  name: string;
  email: string;
  phone: string;
  rut: string; // Chilean RUT (e.g., 12.345.678-9)
  consentLawAccepted: boolean; // Consent Law 19.628 & 20.584
  consentTimestamp?: Timestamp;
  createdAt: Timestamp;
  ownerId: string;
  clinicalCriticalRisk?: "none" | "low" | "medium" | "critical";
  criticalAlertDetail?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientRut?: string; // Chilean RUT
  consentLawAccepted?: boolean;
  date: string; // ISO YYYY-MM-DD
  timeSlot: string; // e.g., "09:00 - 10:00"
  status: "scheduled" | "completed" | "canceled" | "payment_pending" | "attended" | "rescheduled" | "nsp";
  paymentStatus: "pending" | "paid";
  price: number;
  notes: string;
  videoRoomId: string;
  createdAt: Timestamp;
  ownerId: string;
  rescheduleCount?: number; // count of reschedules, max 3
  attendanceStatus?: "pending" | "confirmed" | "nsp"; // NSP = No Se Presenta
  checkedInAt?: Timestamp; // when arrival was marked/simulated
  isCrisis?: boolean; // indicates an emergency crisis overbooking appointment
  evolutionState?: "draft" | "signed"; // Session draft or finalized state
  boletaUrl?: string; // LibreDTE PDF official receipt Link
  boletaFolio?: number; // Official Folio number emitted by Chile's SII
  boletaBruto?: number; // Full gross payment (e.g. 50,000 CLP)
  boletaRetencion?: number; // 2026 Professional Tax Retention (14.5%)
  boletaLiquido?: number; // Net earned (e.g. 42,750 CLP)
}

export interface HistoryRecord {
  id: string;
  patientId: string;
  date: string; // Session Date
  notes: string; // Raw clinical process notes
  observations: string; // Diagnostics / Objective observations
  aiSummary: string; // Structured AI summary written by Gemini API
  createdAt: Timestamp;
  ownerId: string;
  isSigned?: boolean;
  signatureDate?: string;
  signatureName?: string;
  signatureDoc?: string;
  testFormResults?: {
    testName: string;
    score: number;
    answersText: string;
    interpretation: string;
  }[];
}

export interface ClinicSettings {
  id: string;
  therapistName: string;
  contactEmail: string;
  contactPhone: string;
  sessionPrice: number;
  whatsappReminders: boolean;
  emailReminders: boolean;
  updatedAt: Timestamp;
  ownerId: string;
  therapistTitle?: string;
  sisNumber?: string;
  experienceYears?: string;
  bioQuote?: string;
  formationList?: {
    degree: string;
    institution: string;
    year: string;
    description: string;
  }[];
  experienceList?: {
    role: string;
    company: string;
    period: string;
    description: string;
  }[];
  specialties?: string[];
  stripeConnected?: boolean;
  bankAccountMasked?: string;
  bankName?: string;
  passcode2FAEnabled?: boolean;
  passcodePIN?: string;
  signaturePinHash?: string;
  isMaxSecurityEnforced?: boolean;
  flowSandboxMode?: boolean;
}

export interface SecureCallKey {
  roomId: string;
  cryptoToken: string;
  algorithm: string;
  encryptionBits: number;
  certifiedAt: string;
}

export interface ReminderAlert {
  id: string;
  patientName: string;
  channel: "email" | "whatsapp";
  status: "pending" | "sent" | "failed";
  timestamp: string;
  body: string;
}

export interface PatientReview {
  id: string;
  patientName: string;
  rating: number;
  comment: string;
  consentLawAccepted: boolean;
  publicConsent: boolean;
  isAnonymized: boolean;
  ownerId: string;
  createdAt: Timestamp;
}

export interface MoodJournal {
  id: string;
  patientRut: string;
  patientEmail: string;
  patientName: string;
  mood: number; // 1 to 5
  sleepScore: number; // 1 to 5 stars
  sleepHours: number; // sleep duration hours (Maslow)
  cognitiveNote: string;
  ownerId: string;
  createdAt: Timestamp;
}

