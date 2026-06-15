import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, setDoc, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Appointment, Patient } from "../types";
import { 
  Calendar, Clock, Video, Wallet, CheckCircle, XCircle, Trash2, User, Plus, Filter, Info, ShieldAlert,
  ChevronLeft, ChevronRight, Smartphone, Bell, Mail, Layers, Settings, CalendarDays, Check, RefreshCw,
  Edit, FileText
} from "lucide-react";
import { getCachedAccessToken, sendGmail } from "../utils/googleAuth";

function normalizeDateStr(dStr: any): string {
  if (!dStr) return "";
  const str = String(dStr).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    let y = "";
    let m = "";
    let d = "";
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      y = parts[0];
      m = String(parseInt(parts[1], 10));
      d = String(parseInt(parts[2], 10));
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY
      y = parts[2];
      m = String(parseInt(parts[1], 10));
      d = String(parseInt(parts[0], 10));
    } else {
      return str;
    }
    return `${y}-${m}-${d}`;
  }
  return str;
}

interface ClinicianAgendaProps {
  therapistUid: string;
  onJoinCall: (roomId: string, patientMeta?: { id?: string; name?: string; appointmentId?: string }) => void;
}

export default function ClinicianAgenda({ therapistUid, onJoinCall }: ClinicianAgendaProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<"all" | "scheduled" | "completed" | "canceled">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid">("all");
  const [dateFilter, setDateFilter] = useState("");

  // AgendaPro-Style Interactive Calendar View State
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }); // Anchor day corresponding to current system time

  // Customized notification matrices (persisted in localStorage for tactile feedback)
  const [notifEmailRes, setNotifEmailRes] = useState(() => {
    try { return localStorage.getItem("notif_email_res") !== "false"; } catch (e) { return true; }
  });
  const [notifPushRes, setNotifPushRes] = useState(() => {
    try { return localStorage.getItem("notif_push_res") !== "false"; } catch (e) { return true; }
  });
  const [notifSmsRes, setNotifSmsRes] = useState(() => {
    try { return localStorage.getItem("notif_sms_res") === "true"; } catch (e) { return false; }
  });
  const [notifHolidayPush, setNotifHolidayPush] = useState(() => {
    try { return localStorage.getItem("notif_holiday_push") !== "false"; } catch (e) { return true; }
  });

  // Helper to calculate weekly calendar dates (Mon-Sun) based on an arbitrary base date (YYYY-MM-DD representation)
  const getWeekDates = (baseDateStr: string) => {
    const parts = baseDateStr.split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d, 12, 0, 0); // avoid mid-night shift
    const day = date.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
    const mondayShift = day === 0 ? -6 : 1 - day;
    
    const weekDates: { dateStr: string; dayLabel: string; dayNum: number; jsDate: Date }[] = [];
    const dayLabelsShort = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
    
    for (let i = 0; i < 7; i++) {
      const dCalculated = new Date(date);
      dCalculated.setDate(date.getDate() + mondayShift + i);
      const yyyy = dCalculated.getFullYear();
      const mm = String(dCalculated.getMonth() + 1).padStart(2, "0");
      const dd = String(dCalculated.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      weekDates.push({
        dateStr,
        dayLabel: dayLabelsShort[dCalculated.getDay()],
        dayNum: dCalculated.getDate(),
        jsDate: dCalculated
      });
    }
    return weekDates;
  };

  // New manual appointment modal/form
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [selectedPatId, setSelectedPatId] = useState("");
  const [apptDate, setApptDate] = useState(new Date().toISOString().split("T")[0]);
  const [apptSlot, setApptSlot] = useState("18:00 - 18:45");
  const [apptNotes, setApptNotes] = useState("");
  const [apptPrice, setApptPrice] = useState(45000);

  // Load defined time slots from localStorage or use the default initial blocks
  const [timeSlots, setTimeSlots] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("mindspace_defined_slots");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return [
      "18:00 - 18:45",
      "18:45 - 19:30",
      "19:30 - 20:15",
      "20:15 - 21:00"
    ];
  });

  // Modal to manage weekly defined slots
  const [showManageSlotsModal, setShowManageSlotsModal] = useState(false);
  const [newSlotStart, setNewSlotStart] = useState("18:00");
  const [newSlotEnd, setNewSlotEnd] = useState("19:00");
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [editingSlotStart, setEditingSlotStart] = useState("09:00");
  const [editingSlotEnd, setEditingSlotEnd] = useState("10:00");

  // ==========================================
  // CLINICAL AGENDA EXTENSIONS (NEW STATES OR HELPER DATA)
  // ==========================================
  const CHILEAN_HOLIDAYS_2026_2027 = [
    { date: "2026-01-01", name: "Año Nuevo" },
    { date: "2026-04-03", name: "Viernes Santo" },
    { date: "2026-04-04", name: "Sábado Santo" },
    { date: "2026-05-01", name: "Día del Trabajo" },
    { date: "2026-05-21", name: "Día de las Glorias Navales" },
    { date: "2026-06-29", name: "Día de San Pedro y San Pablo" },
    { date: "2026-07-16", name: "Día de la Virgen del Carmen" },
    { date: "2026-08-15", name: "Asunción de la Virgen" },
    { date: "2026-09-18", name: "Fiestas Patrias" },
    { date: "2026-09-19", name: "Glorias del Ejército" },
    { date: "2026-10-12", name: "Encuentro de Dos Mundos" },
    { date: "2026-10-31", name: "Día de las Iglesias Evangélicas" },
    { date: "2026-11-01", name: "Día de Todos los Santos" },
    { date: "2026-12-08", name: "Inmaculada Concepción" },
    { date: "2026-12-25", name: "Navidad" },

    // 2027
    { date: "2027-01-01", name: "Año Nuevo" },
    { date: "2027-03-26", name: "Viernes Santo" },
    { date: "2027-03-27", name: "Sábado Santo" },
    { date: "2027-05-01", name: "Día del Trabajo" },
    { date: "2027-05-21", name: "Día de las Glorias Navales" },
    { date: "2027-06-21", name: "Día Nacional de los Pueblos Indígenas" },
    { date: "2027-06-28", name: "Día de San Pedro y San Pablo" },
    { date: "2027-07-16", name: "Día de la Virgen del Carmen" },
    { date: "2027-08-15", name: "Asunción de la Virgen" },
    { date: "2027-09-18", name: "Fiestas Patrias" },
    { date: "2027-09-19", name: "Glorias del Ejército" },
    { date: "2027-10-11", name: "Encuentro de Dos Mundos" },
    { date: "2027-10-31", name: "Día de las Iglesias Evangélicas" },
    { date: "2027-11-01", name: "Día de Todos los Santos" },
    { date: "2027-12-08", name: "Inmaculada Concepción" },
    { date: "2027-12-25", name: "Navidad" }
  ];

  // 1. Weekly Ordinal Availability Rules
  const [availDays, setAvailDays] = useState<number[]>([1, 2, 3]); // Monday to Wednesday (1-3)
  const [availSlots, setAvailSlots] = useState<string[]>(timeSlots);

  // 2. Emergency Suspensions State
  const [suspDate, setSuspDate] = useState(new Date().toISOString().split("T")[0]);
  const [suspType, setSuspType] = useState<"full_day" | "specific_slots">("full_day");
  const [suspSelectedSlots, setSuspSelectedSlots] = useState<string[]>([]);
  const [suspensions, setSuspensions] = useState<any[]>([]);

  // 3. Automated Rescheduling and Notifications Log
  const [rescheduleProposedList, setRescheduleProposedList] = useState<any[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<string[]>([]);

  // 4. Holiday Alert settings
  const [holidayAlertType, setHolidayAlertType] = useState<"email" | "push" | string>(() => {
    try {
      const saved = localStorage.getItem("mindspace_holiday_alert_type");
      if (saved) return saved;
    } catch (e) {}
    return "push";
  });

  const [dismissedHolidays, setDismissedHolidays] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("mindspace_dismissed_holidays");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const handleDismissHoliday = (date: string) => {
    const updated = [...dismissedHolidays, date];
    setDismissedHolidays(updated);
    try {
      localStorage.setItem("mindspace_dismissed_holidays", JSON.stringify(updated));
    } catch (e) {}
  };

  const handleSaveHolidayAlertSetting = (type: "email" | "push") => {
    setHolidayAlertType(type);
    try {
      localStorage.setItem("mindspace_holiday_alert_type", type);
    } catch (e) {}
  };

  // Panel state switches
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [configSubTab, setConfigSubTab] = useState<"holidays" | "weekly_avail" | "emergency" | "notifications">("holidays");

  // Load configs on mount
  useEffect(() => {
    try {
      const savedAvail = localStorage.getItem("mindspace_availability");
      if (savedAvail) {
        const parsed = JSON.parse(savedAvail);
        setAvailDays(parsed.days || [1, 2, 3]);
        setAvailSlots(parsed.slots || timeSlots);
      } else {
        setAvailDays([1, 2, 3]);
        setAvailSlots(timeSlots);
      }

      const savedSusp = localStorage.getItem("mindspace_emergency_suspensions");
      if (savedSusp) {
        setSuspensions(JSON.parse(savedSusp));
      }
    } catch (e) {
      console.error("Error loading clinician availability maps", e);
    }
  }, []);

  // ManageDefinedSlots Helpers
  const handleAddNewSlot = () => {
    if (!newSlotStart || !newSlotEnd) {
      alert("⚠️ Por favor asigne hora de inicio y término.");
      return;
    }
    const [startHH, startMM] = newSlotStart.split(":").map(Number);
    const [endHH, endMM] = newSlotEnd.split(":").map(Number);
    if (startHH > endHH || (startHH === endHH && startMM >= endMM)) {
      alert("⚠️ La hora de inicio debe ser anterior a la hora de término.");
      return;
    }

    const formattedSlot = `${newSlotStart} - ${newSlotEnd}`;
    if (timeSlots.includes(formattedSlot)) {
      alert("⚠️ Este bloque horario ya existe.");
      return;
    }

    const updated = [...timeSlots, formattedSlot];
    
    updated.sort((a, b) => {
      const aStart = a.split(" - ")[0] || "00:00";
      const bStart = b.split(" - ")[0] || "00:00";
      const [aH, aM] = aStart.split(":").map(Number);
      const [bH, bM] = bStart.split(":").map(Number);
      if (aH !== bH) return aH - bH;
      return aM - bM;
    });

    setTimeSlots(updated);
    setAvailSlots([...availSlots, formattedSlot]); // Auto-enable by default
    localStorage.setItem("mindspace_defined_slots", JSON.stringify(updated));
  };

  const handleStartEditSlot = (index: number) => {
    setEditingSlotIndex(index);
    const slot = timeSlots[index];
    const [start, end] = slot.split(" - ");
    setEditingSlotStart(start || "09:00");
    setEditingSlotEnd(end || "10:00");
  };

  const handleSaveEditSlot = () => {
    if (editingSlotIndex === null) return;
    if (!editingSlotStart || !editingSlotEnd) {
      alert("⚠️ Por favor asigne hora de inicio y término.");
      return;
    }
    const [startHH, startMM] = editingSlotStart.split(":").map(Number);
    const [endHH, endMM] = editingSlotEnd.split(":").map(Number);
    if (startHH > endHH || (startHH === endHH && startMM >= endMM)) {
      alert("⚠️ La hora de inicio debe ser anterior a la hora de término.");
      return;
    }

    const newFormatted = `${editingSlotStart} - ${editingSlotEnd}`;
    const oldSlot = timeSlots[editingSlotIndex];

    const updated = [...timeSlots];
    updated[editingSlotIndex] = newFormatted;

    updated.sort((a, b) => {
      const aStart = a.split(" - ")[0] || "00:00";
      const bStart = b.split(" - ")[0] || "00:00";
      const [aH, aM] = aStart.split(":").map(Number);
      const [bH, bM] = bStart.split(":").map(Number);
      if (aH !== bH) return aH - bH;
      return aM - bM;
    });

    setTimeSlots(updated);
    
    if (availSlots.includes(oldSlot)) {
      setAvailSlots(prev => prev.map(s => s === oldSlot ? newFormatted : s));
    }

    localStorage.setItem("mindspace_defined_slots", JSON.stringify(updated));
    setEditingSlotIndex(null);
  };

  const handleDeleteSlot = (index: number) => {
    const slotToDelete = timeSlots[index];
    if (confirm(`¿Está seguro de que desea eliminar el bloque ${slotToDelete}?`)) {
      const updated = timeSlots.filter((_, i) => i !== index);
      setTimeSlots(updated);
      setAvailSlots(availSlots.filter(s => s !== slotToDelete));
      localStorage.setItem("mindspace_defined_slots", JSON.stringify(updated));
      if (editingSlotIndex === index) {
        setEditingSlotIndex(null);
      }
    }
  };

  // Save weekly structure helper
  const handleSaveWeeklyAvailability = () => {
    const data = { days: availDays, slots: availSlots };
    localStorage.setItem("mindspace_availability", JSON.stringify(data));
    // Dispatch a virtual event to let public calendars synchronize
    window.dispatchEvent(new Event("storage"));
    alert("✅ Estructura horaria de consulta semanal guardada con éxito.");
  };

  // Toggle days of the week selection (standard: JS getDay() Monday=1 ... Saturday=6, Sunday=0)
  const handleToggleDayOfWeek = (day: number) => {
    if (availDays.includes(day)) {
      setAvailDays(availDays.filter(d => d !== day));
    } else {
      setAvailDays([...availDays, day]);
    }
  };

  const handleToggleSlotAvailability = (slot: string) => {
    if (availSlots.includes(slot)) {
      setAvailSlots(availSlots.filter(s => s !== slot));
    } else {
      setAvailSlots([...availSlots, slot]);
    }
  };

  // Algorithm: Calculate next active available slot following the therapist rules
  const calculateNextProposedSlot = (
    currentDateStr: string,
    currentTimeSlot: string,
    existingAppts: Appointment[],
    availability: { days: number[]; slots: string[] },
    activeSuspensions: any[]
  ) => {
    let dateObj = new Date(currentDateStr + "T00:00:00");
    let proposedDateStr = "";
    let proposedSlot = currentTimeSlot;
    let found = false;

    // Search future dates starting from tomorrow up to 30 days
    for (let i = 1; i <= 30; i++) {
      dateObj.setDate(dateObj.getDate() + 1);
      const checkDateStr = dateObj.toISOString().split("T")[0];
      const jsDay = dateObj.getDay(); // Sunday=0, Monday=1, etc.

      // 1. Is it a workday according to availability settings?
      if (!availability.days.includes(jsDay)) continue;

      // 2. Is it a Chilean public holiday?
      const isHoliday = CHILEAN_HOLIDAYS_2026_2027.some(h => h.date === checkDateStr);
      if (isHoliday) continue;

      // 3. Is the full day emergency-blocked?
      const existingSusp = activeSuspensions.find(s => s.date === checkDateStr);
      if (existingSusp && existingSusp.type === "full_day") continue;

      // 4. Collect standard active slots on this specific day (filtering out blocked specific blocks)
      let daySlots = [...availability.slots];
      if (existingSusp && existingSusp.type === "specific_slots") {
        daySlots = daySlots.filter(slot => !existingSusp.slots.includes(slot));
      }

      // Filter out slots that are already booked by other clients
      const freeSlots = daySlots.filter(slot => {
        return !existingAppts.some(
          appt => appt.date === checkDateStr && appt.timeSlot === slot && appt.status === "scheduled"
        );
      });

      if (freeSlots.length > 0) {
        proposedDateStr = checkDateStr;
        // Keep the exact same class slot if still open, otherwise take first available
        proposedSlot = freeSlots.includes(currentTimeSlot) ? currentTimeSlot : freeSlots[0];
        found = true;
        break;
      }
    }

    return {
      date: proposedDateStr || "Sin bloques libres en próximos 30 días",
      slot: proposedSlot
    };
  };

  // Trigger Emergency Suspension (Blocks slots & triggers scheduling suggestions + simulated triggers warnings)
  const handleExecuteEmergencySuspension = async () => {
    if (!suspDate) {
      alert("Por favor, seleccione una fecha válida.");
      return;
    }

    const alreadySuspended = suspensions.some(s => s.date === suspDate && s.type === "full_day");
    if (alreadySuspended) {
      alert("Este día seleccionado ya tiene activa una orden de suspensión total.");
      return;
    }

    if (suspType === "specific_slots" && suspSelectedSlots.length === 0) {
      alert("Seleccione al menos un bloque para suspender parcialmente.");
      return;
    }

    const newSusp = {
      id: "susp_" + Math.random().toString(36).substring(2, 8),
      date: suspDate,
      type: suspType,
      slots: suspType === "specific_slots" ? [...suspSelectedSlots] : []
    };

    const updatedSusp = [...suspensions, newSusp];
    setSuspensions(updatedSusp);
    localStorage.setItem("mindspace_emergency_suspensions", JSON.stringify(updatedSusp));

    // Identify ALL therapist bookings scheduled in the affected slot(s)
    const affectedAppointments = appointments.filter(appt => {
      if (appt.date !== suspDate || appt.status !== "scheduled") return false;
      if (suspType === "full_day") return true;
      return suspSelectedSlots.includes(appt.timeSlot);
    });

    const gmailToken = getCachedAccessToken();
    const pendingProposals: any[] = [];
    const dispatchTrace: string[] = [];

    // Trigger updates
    for (const appt of affectedAppointments) {
      // 1. Transactional Cancellation in Firebase DB
      try {
        const apptRef = doc(db, "appointments", appt.id);
        await updateDoc(apptRef, { status: "canceled" });
      } catch (err) {
        console.error("Error setting appointment status to canceled", err);
      }

      // 2. Compute dynamic next available displacement slot
      const nextProposed = calculateNextProposedSlot(
        appt.date,
        appt.timeSlot,
        appointments,
        { days: availDays, slots: availSlots },
        updatedSusp
      );

      pendingProposals.push({
        id: "prop_" + Math.random().toString(36).substring(2, 9),
        originalAppointment: appt,
        proposedDate: nextProposed.date,
        proposedSlot: nextProposed.slot,
        processed: false
      });

      // Send clinical emergency suspension email via Gmail if clinician is integrated!
      if (gmailToken && appt.patientEmail) {
        const subject = `AVISO: Reprogramación de consulta psicológica urgente - MindSpace Clinica`;
        const bodyContent = `
          <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 25px; border: 1px solid #fee2e2; border-radius: 16px; background-color: #fef2f2;">
            <div style="border-bottom: 2px solid #b91c1c; padding-bottom: 15px; margin-bottom: 20px;">
              <h2 style="color: #991b1b; margin: 0; font-size: 18px;">⚠️ Aviso de Suspensión de Agenda Clínica</h2>
              <p style="color: #7f1d1d; margin: 5px 0 0 0; font-size: 11px;">MindSpace - Consulta Médica</p>
            </div>
            
            <p style="font-size: 13px; color: #1f2937; line-height: 1.6;">
              Estimado(a) <strong>${appt.patientName}</strong>,
            </p>
            
            <p style="font-size: 13px; color: #374151; line-height: 1.6;">
              Le informamos que por motivos de fuerza mayor de carácter de emergencia médica o personal, el analista o especialista clínico ha debido suspender temporalmente su agenda para la próxima fecha:
            </p>
            
            <div style="background-color: #ffffff; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
              <span style="font-size: 11px; color: #7f1d1d; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Turno Afectado</span>
              <strong style="font-size: 15px; color: #991b1b; display: block;">${appt.date} a las ${appt.timeSlot} hrs</strong>
            </div>

            <p style="font-size: 13px; color: #374151; line-height: 1.6;">
              Para velar por su continuidad clínica de inmediato, se le ha propuesto la siguiente alternativa de reagendamiento automático sin costo alguno:
            </p>

            <div style="background-color: #e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
              <span style="font-size: 11px; color: #0369a1; text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Nueva Alternativa Reagendada</span>
              <strong style="font-size: 15px; color: #0369a1; display: block;">${nextProposed.date} a las ${nextProposed.slot} hrs</strong>
            </div>

            <p style="font-size: 12px; color: #4b5563;">
              Para confirmar o modificar esta alternativa, por favor ingrese a su <strong>Portal del Paciente</strong> en nuestra web de reserva a la brevedad.
            </p>

            <div style="border-top: 1px solid #fca5a5; padding-top: 15px; margin-top: 25px; font-size: 10px; color: #9ca3af; text-align: center;">
              <p>Este aviso clínico ha sido despachado en tiempo real desde la casilla de enlace médico oficial.</p>
              <p>© 2026 MindSpace Chile. Ley 20.584 de Derechos y Deberes del Paciente.</p>
            </div>
          </div>
        `;
        sendGmail(gmailToken, appt.patientEmail, subject, bodyContent).catch((e) => console.error("Error dispatching suspension mail:", e));
      }

      // 3. Format patient emergency dispatch
      const alertTime = new Date().toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' });
      dispatchTrace.push(
        `🚨 [${alertTime}] Notificación remitiéndose a ${appt.patientName} (${appt.patientEmail}): Su consulta del ${appt.date} @ ${appt.timeSlot} fue suspendida. Alternativa: ${nextProposed.date} @ ${nextProposed.slot}.`
      );
    }

    setRescheduleProposedList(prev => [...pendingProposals, ...prev]);
    setNotificationLogs(prev => [...dispatchTrace, ...prev]);

    // Dispatch custom event to notify BookingCalendar
    window.dispatchEvent(new Event("storage"));

    if (affectedAppointments.length > 0) {
      alert(`🚨 Bloqueo Ejecutado: Se suspendió la agenda de hoy. Se detectaron ${affectedAppointments.length} consultas agendadas. Se han emitido notificaciones preventivas y creado las alternativas de reagendamiento.`);
    } else {
      alert("✅ Bloqueo Ejecutado: No se detectaron citas agendadas de pacientes en esta fecha/bloques. La disponibilidad pública se ha actualizado de inmediato.");
    }

    setSuspSelectedSlots([]);
  };

  const handleConfirmAlternativeBooking = async (proposalId: string) => {
    const proposal = rescheduleProposedList.find(p => p.id === proposalId);
    if (!proposal) return;

    try {
      const orig = proposal.originalAppointment;
      const cleanSlot = proposal.proposedSlot.replace(/[^a-zA-Z0-9]/g, "_");
      const apptId = `appt_${therapistUid}_${proposal.proposedDate}_${cleanSlot}`;
      const apptRef = doc(db, "appointments", apptId);

      const newAppt: Appointment = {
        id: apptId,
        patientId: orig.patientId,
        patientName: orig.patientName,
        patientEmail: orig.patientEmail,
        patientPhone: orig.patientPhone,
        patientRut: orig.patientRut || "",
        consentLawAccepted: orig.consentLawAccepted || true,
        date: proposal.proposedDate,
        timeSlot: proposal.proposedSlot,
        status: "scheduled",
        paymentStatus: orig.paymentStatus, // maintain payment
        price: orig.price,
        notes: `Turno clínico reagendado debido a suspensión de fecha original ${orig.date} @ ${orig.timeSlot}.`,
        videoRoomId: "room_" + Math.random().toString(36).substring(2, 11),
        createdAt: Timestamp.now(),
        ownerId: therapistUid
      };

      await setDoc(apptRef, newAppt);

      // Clean proposal
      setRescheduleProposedList(prev => prev.map(p => p.id === proposalId ? { ...p, processed: true } : p));
      
      const logTime = new Date().toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' });
      setNotificationLogs(prev => [
        `✅ [${logTime}] Agendado exitosamente para el paciente ${orig.patientName} el día ${proposal.proposedDate} @ ${proposal.proposedSlot}.`,
        ...prev
      ]);

      alert(`✅ Cita confirmada con éxito para el ${proposal.proposedDate} @ ${proposal.proposedSlot}.`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, "appointments");
    }
  };

  const handleRemoveSuspension = (suspId: string) => {
    const updated = suspensions.filter(s => s.id !== suspId);
    setSuspensions(updated);
    localStorage.setItem("mindspace_emergency_suspensions", JSON.stringify(updated));
    window.dispatchEvent(new Event("storage"));
    alert("🔓 Se ha levantado la suspensión del bloque. Volverá a estar público e investigable por pacientes.");
  };

  // Analyze imminent Chilean holidays based on current date
  const getUpcomingAnalysis = () => {
    // Standard system date (current target: dynamic today)
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    
    return CHILEAN_HOLIDAYS_2026_2027
      .map(h => {
        const holidayDate = new Date(h.date + "T00:00:00");
        const diffTime = holidayDate.getTime() - baseDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { ...h, diffDays };
      })
      .filter(item => item.diffDays >= 0) // only upcoming
      .sort((a, b) => a.diffDays - b.diffDays);
  };

  const upcomingHolidays = getUpcomingAnalysis();
  const imminentHoliday = upcomingHolidays.find(h => 
    h.diffDays <= 35 &&
    !suspensions.some(s => s.date === h.date) &&
    !dismissedHolidays.includes(h.date)
  );

  // 1. Fetch appointments owned by therapist
  useEffect(() => {
    if (!therapistUid) return;

    const q = query(
      collection(db, "appointments"),
      where("ownerId", "==", therapistUid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Appointment[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Appointment);
      });
      // Sort appointments by date and slot
      list.sort((a, b) => b.date.localeCompare(a.date) || b.timeSlot.localeCompare(a.timeSlot));
      setAppointments(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "appointments");
    });

    return () => unsubscribe();
  }, [therapistUid]);

  // 2. Fetch list of patients to allow manual assignments
  useEffect(() => {
    if (!therapistUid) return;

    const q = query(collection(db, "patients"), where("ownerId", "==", therapistUid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Patient[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Patient);
      });
      setPatients(list);
    });

    return () => unsubscribe();
  }, [therapistUid]);

  const [activeAbbySims, setActiveAbbySims] = useState<string[]>([]);

  // Helper to verify if the video consult join button ("Atender") is within permitted window (same date + 15m before up to slot ending + 15m)
  const checkIsAtenderEnabled = (apptDate: string, timeSlot: string) => {
    try {
      const now = new Date();
      // Chilean/local current date in standard ISO YYYY-MM-DD
      const todayStr = now.toLocaleDateString("en-CA");
      if (apptDate !== todayStr) return "different_day";

      const [startStr, endStr] = timeSlot.split("-").map(s => s.trim());
      const [startH, startM] = startStr.split(":").map(Number);
      const [endH, endM] = endStr.split(":").map(Number);

      const startWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM - 15);
      const endWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM + 15);

      if (now < startWindow) {
        return "too_early";
      } else if (now > endWindow) {
        return "expired";
      }
      return "active";
    } catch {
      return "disabled";
    }
  };

  const getUnifiedStateKey = (appt: Appointment) => {
    if (appt.isCrisis) return "crisis";
    if (appt.status === "canceled") return "canceled";
    if (appt.status === "completed") {
      if (appt.evolutionState === "draft") return "completed_draft";
      return "completed_signed";
    }
    if (appt.paymentStatus !== "paid") return "unpaid";
    if (appt.attendanceStatus === "confirmed") return "ready";
    if (appt.attendanceStatus === "nsp") return "nsp";
    return "scheduled_pending";
  };

  const renderUnifiedStateBadge = (appt: Appointment) => {
    const uKey = getUnifiedStateKey(appt);
    const isAbbyActive = activeAbbySims.includes(appt.id);
    
    let label = "Esperando Arribo";
    let IconComponent = Clock;
    let iconColor = "text-slate-400 dark:text-slate-500";
    let textColor = "text-slate-500 dark:text-slate-400"; // intermediate gray
    
    switch (uKey) {
      case "crisis":
        label = "🚨 CRISIS EMOCIONAL";
        IconComponent = ShieldAlert;
        iconColor = "text-red-500 animate-pulse";
        textColor = "text-red-600 dark:text-red-400 font-extrabold";
        break;
      case "unpaid":
        label = "Pendiente Pago";
        IconComponent = Wallet;
        iconColor = "text-amber-500/80 dark:text-amber-500/60";
        textColor = "text-slate-500 dark:text-slate-400";
        break;
      case "canceled":
        label = "Anulado";
        IconComponent = XCircle;
        iconColor = "text-rose-400 dark:text-rose-500/50";
        textColor = "text-slate-400 dark:text-slate-550 line-through opacity-75";
        break;
      case "completed_draft":
        label = "📝 Completar";
        IconComponent = Edit;
        iconColor = "text-amber-500 dark:text-amber-400 animate-pulse";
        textColor = "text-amber-650 dark:text-amber-450 font-black";
        break;
      case "completed_signed":
        label = "✓ Completado";
        IconComponent = CheckCircle;
        iconColor = "text-emerald-500 dark:text-emerald-400";
        textColor = "text-emerald-600 dark:text-emerald-400 font-black";
        break;
      case "ready":
        label = "En Sala (Paciente Listo)";
        IconComponent = CheckCircle; // green checkmark
        iconColor = "text-emerald-550 dark:text-emerald-400 animate-pulse";
        textColor = "text-emerald-700 dark:text-emerald-450 font-bold";
        break;
      case "nsp":
        label = "No Presentado (NSP)";
        IconComponent = ShieldAlert;
        iconColor = "text-red-500/80 dark:text-red-400/80";
        textColor = "text-slate-500 dark:text-slate-400";
        break;
      case "scheduled_pending":
      default:
        label = "Esperando Arribo";
        IconComponent = Clock;
        iconColor = "text-slate-400/90 dark:text-slate-500/90";
        textColor = "text-slate-500 dark:text-slate-400";
        break;
    }

    return (
      <div className="flex items-center gap-2">
        {isAbbyActive && (
          <div className="flex items-center gap-1.5 text-[10px] text-sky-600 dark:text-sky-450 font-extrabold animate-pulse mr-1">
            <Clock className="w-3.5 h-3.5 animate-spin text-sky-500" />
            <span>Abby contactando...</span>
          </div>
        )}

        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3.5 py-1.5 shadow-2xs select-none">
          <IconComponent className={`w-3.5 h-3.5 ${iconColor}`} />
          <span className={`text-[10.5px] font-semibold tracking-tight ${textColor}`}>
            {label}
          </span>
        </div>
      </div>
    );
  };

  const handleTransitionUnifiedState = async (apptId: string, newKey: string) => {
    try {
      const apptRef = doc(db, "appointments", apptId);
      let updateData: any = {};
      if (newKey === "canceled") {
        updateData.status = "canceled";
      } else if (newKey === "completed") {
        updateData.status = "completed";
        updateData.paymentStatus = "paid";
        updateData.attendanceStatus = "confirmed";
      } else if (newKey === "unpaid") {
        updateData.status = "scheduled";
        updateData.paymentStatus = "pending";
        updateData.attendanceStatus = "pending";
      } else if (newKey === "ready") {
        updateData.status = "scheduled";
        updateData.paymentStatus = "paid";
        updateData.attendanceStatus = "confirmed";
        updateData.checkedInAt = Timestamp.now();
      } else if (newKey === "nsp") {
        updateData.status = "scheduled";
        updateData.paymentStatus = "paid";
        updateData.attendanceStatus = "nsp";
      } else if (newKey === "scheduled_pending") {
        updateData.status = "scheduled";
        updateData.paymentStatus = "paid";
        updateData.attendanceStatus = "pending";
      }
      await updateDoc(apptRef, updateData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${apptId}`);
    }
  };

  // Autonomous Background Abby Check-in Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
      const currentDay = String(now.getDate()).padStart(2, "0");
      const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;

      appointments.forEach((appt) => {
        // 1. Check-in simulation
        if (
          appt.status === "scheduled" &&
          appt.paymentStatus === "paid" &&
          appt.attendanceStatus === "pending" &&
          appt.date === todayStr &&
          !activeAbbySims.includes(appt.id)
        ) {
          const atenderState = checkIsAtenderEnabled(appt.date, appt.timeSlot);
          if (atenderState === "active") {
            setActiveAbbySims(prev => [...prev, appt.id]);

            const logMsg = `[Abby Autónomo] 🤖 Abby inició contacto preventivo de arribo vía WhatsApp con el paciente "${appt.patientName}" (bloque de las ${appt.timeSlot}).`;
            setNotificationLogs(prev => [logMsg, ...prev]);

            setTimeout(async () => {
              try {
                const apptRef = doc(db, "appointments", appt.id);
                await updateDoc(apptRef, {
                  attendanceStatus: "confirmed",
                  checkedInAt: Timestamp.now()
                });
                const successMsg = `[Arribo Inteligente] 📱 El paciente "${appt.patientName}" cargó el enlace, confirmó estabilidad técnica y entró a la Sala de Espera Virtual.`;
                setNotificationLogs(prev => [successMsg, ...prev]);
              } catch (e) {
                console.error("Autonomous Abby checkin failed:", e);
              } finally {
                setActiveAbbySims(prev => prev.filter(id => id !== appt.id));
              }
            }, 6000);
          }
        }

        // 2. Automated Logical Transition for Expired consultations today
        if (
          appt.status === "scheduled" &&
          appt.date === todayStr
        ) {
          const atenderState = checkIsAtenderEnabled(appt.date, appt.timeSlot);
          if (atenderState === "expired") {
            (async () => {
              try {
                const apptRef = doc(db, "appointments", appt.id);
                if (appt.attendanceStatus === "confirmed") {
                  await updateDoc(apptRef, { status: "completed" });
                  const infoMsg = `[Auto-Clínica] 📅 Turno concluido. El bloque de la consulta de "${appt.patientName}" expiró, registrándose como COMPLETADO automáticamente.`;
                  setNotificationLogs(prev => [infoMsg, ...prev]);
                } else if (appt.attendanceStatus === "pending") {
                  await updateDoc(apptRef, { attendanceStatus: "nsp" });
                  const infoMsg = `[Auto-Clínica] ⚠️ Turno expirado. El paciente "${appt.patientName}" no se presentó en la sala de espera virtual (Registrado como NSP).`;
                  setNotificationLogs(prev => [infoMsg, ...prev]);
                }
              } catch (err) {
                console.error("Auto transition expired appointment failed:", err);
              }
            })();
          }
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [appointments, activeAbbySims]);

  // Actions: Update Appointment status
  const handleUpdateStatus = async (apptId: string, newStatus: "scheduled" | "completed" | "canceled") => {
    try {
      const apptRef = doc(db, "appointments", apptId);
      await updateDoc(apptRef, { status: newStatus });

      if (newStatus === "canceled") {
        const apptObj = appointments.find((a) => a.id === apptId);
        const gmailToken = getCachedAccessToken();
        if (gmailToken && apptObj && apptObj.patientEmail) {
          const subject = "Aviso de Cancelación de Cita de Psicoterapia - MindSpace";
          const body = `
            <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 25px; border: 1px solid #fee2e2; border-radius: 16px; background-color: #f8fafc;">
              <h2 style="color: #b91c1c; margin: 0 0 15px 0;">Consulta Psicológica Cancelada</h2>
              <p>Estimado(a) <strong>${apptObj.patientName}</strong>,</p>
              <p>Le informamos que su cita agendada para el día <strong>${apptObj.date}</strong> a las <strong>${apptObj.timeSlot} hrs</strong> ha sido cancelada.</p>
              <p>Si requiere reagendar un nuevo espacio, por favor acceda a nuestro sistema en línea para revisar las horas disponibles en el calendario público.</p>
              <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
              <p style="font-size: 11px; color: #64748b; text-align: center;">© 2026 MindSpace Chile. En cumplimiento de la Ley 20.584.</p>
            </div>
          `;
          sendGmail(gmailToken, apptObj.patientEmail, subject, body).catch((e) => console.error("Error dispatching cancel mail:", e));
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${apptId}`);
    }
  };

  // Actions: Update Payment status
  const handleUpdatePaymentStatus = async (apptId: string, newPaymentStatus: "pending" | "paid") => {
    try {
      const apptRef = doc(db, "appointments", apptId);
      await updateDoc(apptRef, { paymentStatus: newPaymentStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${apptId}`);
    }
  };

  // Actions: Delete appointment
  const handleDeleteAppointment = async (apptId: string) => {
    if (!confirm("¿Está seguro de eliminar esta casilla de agendamiento?")) return;
    try {
      const apptRef = doc(db, "appointments", apptId);
      await deleteDoc(apptRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `appointments/${apptId}`);
    }
  };

  const handleJoinCallWithForceCheckIn = async (appt: Appointment) => {
    if (appt.attendanceStatus === "pending") {
      try {
        const apptRef = doc(db, "appointments", appt.id);
        await updateDoc(apptRef, {
          attendanceStatus: "confirmed",
          checkedInAt: Timestamp.now()
        });
        const apptMsg = `[Clínico] 👨‍⚕️ El profesional inició el video y admitió automáticamente al paciente "${appt.patientName}" en la sala.`;
        setNotificationLogs(prev => [apptMsg, ...prev]);
      } catch (e) {
        console.error("Failed to automatically confirm attendance:", e);
      }
    }
    const finalPatientId = (() => {
      if (appt.patientId && appt.patientId.startsWith("pat_")) {
        return appt.patientId;
      }
      const match = patients.find(p => 
        (appt.patientId && p.id === appt.patientId) || 
        (appt.patientEmail && p.email?.trim().toLowerCase() === appt.patientEmail?.trim().toLowerCase()) || 
        (appt.patientRut && p.rut?.trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase() === appt.patientRut?.trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase())
      );
      return match ? match.id : (appt.patientId || appt.patientEmail);
    })();
    onJoinCall(appt.videoRoomId, { id: finalPatientId, name: appt.patientName, appointmentId: appt.id });
  };

  // Action: Create manual appointment
  const handleCreateManualAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatId) {
      alert("Por favor, seleccione un paciente de la lista.");
      return;
    }

    const patient = patients.find((p) => p.id === selectedPatId);
    if (!patient) return;

    try {
      const cleanSlot = apptSlot.replace(/[^a-zA-Z0-9]/g, "_");
      const apptId = `appt_${therapistUid}_${apptDate}_${cleanSlot}`;
      const apptRef = doc(db, "appointments", apptId);

      const newAppt: Appointment = {
        id: apptId,
        patientId: patient.id,
        patientName: patient.name,
        patientEmail: patient.email,
        patientPhone: patient.phone,
        date: apptDate,
        timeSlot: apptSlot,
        status: "scheduled",
        paymentStatus: "pending",
        price: apptPrice,
        notes: apptNotes || "Cita agendada manualmente por el terapeuta.",
        videoRoomId: "room_" + Math.random().toString(36).substring(2, 11),
        createdAt: Timestamp.now(),
        ownerId: therapistUid
      };

      await setDoc(apptRef, newAppt);
      setApptNotes("");
      setShowAddAppt(false);
      alert("✅ Turno asignado correctamente en la agenda visual.");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "appointments");
    }
  };

  // Helper to format date strings to full human-friendly Spanish sentences (useful for tactile headers)
  const formatSpanishDate = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const date = new Date(y, m, d, 12, 0, 0); // stable timezone noon representation
      
      const weekdays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      
      return `${weekdays[date.getDay()]} ${d} de ${months[date.getMonth()]} de ${y}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Filter application
  const filteredAppts = appointments.filter((appt) => {
    const matchesStatus = statusFilter === "all" || appt.status === statusFilter;
    const matchesPayment = paymentFilter === "all" || appt.paymentStatus === paymentFilter;
    const matchesDate = !dateFilter || appt.date === dateFilter;
    return matchesStatus && matchesPayment && matchesDate;
  });

  const activeCrisisAppts = appointments.filter(
    (appt) => appt.isCrisis === true && appt.status === "scheduled"
  );

  return (
    <div className="space-y-6">

      {/* SECCIÓN CRÍTICA DE ALERTA DE CRISIS EMOCIONAL INMEDIATA */}
      {activeCrisisAppts.length > 0 && (
        <div className="bg-red-50 dark:bg-rose-950/20 border-2 border-red-500 rounded-3xl p-5 space-y-4 shadow-md animate-pulse">
          <div className="flex items-start md:items-center gap-3">
            <span className="flex h-3 w-3 rounded-full bg-red-600 animate-ping mt-1.5 md:mt-0" />
            <ShieldAlert className="w-6 h-6 text-red-650 dark:text-red-400 animate-bounce flex-shrink-0" />
            <div>
              <h3 className="text-sm font-extrabold text-red-700 dark:text-red-400 uppercase tracking-wide">
                ⚠️ ALERTA CENTRAL DE CRISIS ACTIVA ({activeCrisisAppts.length})
              </h3>
              <p className="text-[11px] text-red-950 dark:text-red-300">
                Se han activado solicitudes de sobrecupo de urgencia inmediata por desborde emocional agudo. Por favor, conéctese de inmediato con el paciente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeCrisisAppts.map((appt) => (
              <div 
                key={appt.id} 
                className="bg-white dark:bg-slate-900 border border-red-200 dark:border-rose-900/60 p-4 rounded-2xl flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <span className="block font-bold text-slate-900 dark:text-white text-xs">
                    👤 Paciente: {appt.patientName}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    📞 Teléfono de Contacto: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{appt.patientPhone}</span>
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    ✉️ Email: <span className="font-mono text-slate-700 dark:text-slate-300">{appt.patientEmail}</span>
                  </span>
                  {appt.notes && (
                    <div className="p-2.5 bg-rose-50/50 dark:bg-rose-950/10 rounded-xl text-[11px] border border-red-100/50 text-slate-600 dark:text-slate-300 leading-relaxed italic mt-1">
                      "✍️ {appt.notes}"
                    </div>
                  )}
                </div>

                <div className="pt-2.5 border-t dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    📌 Horario Bloque: <span className="text-red-650 font-mono font-extrabold">{appt.timeSlot}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const finalPatientId = (() => {
                        if (appt.patientId && appt.patientId.startsWith("pat_")) {
                          return appt.patientId;
                        }
                        const match = patients.find(p => 
                          (appt.patientId && p.id === appt.patientId) || 
                          (appt.patientEmail && p.email?.trim().toLowerCase() === appt.patientEmail?.trim().toLowerCase()) || 
                          (appt.patientRut && p.rut?.trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase() === appt.patientRut?.trim().replace(/\./g, "").replace(/\-/g, "").toLowerCase())
                        );
                        return match ? match.id : (appt.patientId || appt.patientEmail);
                      })();
                      onJoinCall(appt.videoRoomId, { id: finalPatientId, name: appt.patientName, appointmentId: appt.id });
                    }}
                    className="py-1.5 px-3 bg-red-650 hover:bg-red-705 text-white font-extrabold rounded-xl text-[11px] uppercase flex items-center gap-1 cursor-pointer shadow hover:scale-[1.01] active:scale-99 transition-all"
                  >
                    <Video className="w-3.5 h-3.5 text-white" /> Atender Urgencia Ahora
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* PROFESSIONAL CONFIGURATION & SCHEDULING CONTROL PANEL */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-xs">
        <div 
          onClick={() => setShowConfigPanel(!showConfigPanel)}
          className="bg-slate-900 text-white p-4 flex justify-between items-center cursor-pointer hover:bg-slate-850 transition-all select-none"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="font-bold">Panel Terapéutico Inteligente: Disponibilidad, Feriados y Bloqueos de Emergencia</h3>
          </div>
          <div className="flex items-center gap-2 text-[10px] bg-slate-800 text-slate-300 font-semibold px-2 py-1 rounded-md">
            {showConfigPanel ? "Ocultar Panel ▲" : "Desplegar Panel y Analizar ▼"}
          </div>
        </div>

        {showConfigPanel && (
          <div className="p-5 space-y-5 border-t border-gray-200">
            {/* Tab Toggles */}
            <div className="flex flex-wrap border-b pb-3 gap-2">
              <button
                type="button"
                onClick={() => setConfigSubTab("holidays")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                  configSubTab === "holidays" ? "bg-slate-900 text-white shadow-sm" : "text-gray-500 hover:text-slate-800 bg-gray-50 dark:bg-slate-850"
                }`}
              >
                🇨🇱 Análisis Inteligente de Feriados
              </button>
              <button
                type="button"
                onClick={() => setConfigSubTab("weekly_avail")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                  configSubTab === "weekly_avail" ? "bg-slate-900 text-white shadow-sm" : "text-gray-500 hover:text-slate-800 bg-gray-50 dark:bg-slate-850"
                }`}
              >
                📅 Disponibilidad Semanal Ordinaria
              </button>
              <button
                type="button"
                onClick={() => setConfigSubTab("emergency")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                  configSubTab === "emergency" ? "bg-slate-900 text-white shadow-sm" : "text-gray-500 hover:text-slate-800 bg-gray-50 dark:bg-slate-850"
                }`}
              >
                🚨 Botón de Suspensión de Emergencia
              </button>
              <button
                type="button"
                onClick={() => setConfigSubTab("notifications")}
                className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                  configSubTab === "notifications" ? "bg-slate-900 text-white shadow-sm" : "text-gray-500 hover:text-slate-800 bg-gray-50 dark:bg-slate-850"
                }`}
              >
                🔔 Notificaciones y Mensajería
              </button>
            </div>

            {/* TAB 1: HOLIDAYS ANALYZER */}
            {configSubTab === "holidays" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-slate-50 border p-4 rounded-xl flex items-start gap-3">
                  <div className="bg-slate-900 text-white p-2 rounded-lg font-bold text-center leading-tight">
                    ANALIZADOR
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Auditoría Automática de Feriados Nacionales de Chile</h4>
                    <p className="text-gray-500 mt-0.5 leading-relaxed">
                      El sistema detecta automáticamente los próximos feriados oficiales chilenos para alertar al especialista de modo preliminar. Esto permite tomar decisiones preventivas como pre-bloquear días para viajes o descanso personal antes de que los pacientes agenden sus turnos terapéuticos.
                    </p>
                  </div>
                </div>

                {/* Intelligent alert if holiday is approaching */}
                {imminentHoliday ? (
                  <div className="border border-sky-200 bg-sky-50 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-pulse">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sky-850 font-bold text-sm">
                        <span>💡</span> Recomendación Estratégica: Feriado en {imminentHoliday.diffDays} días
                      </div>
                      <p className="text-xs text-sky-700 leading-tight">
                        El feriado nacional por <strong>{imminentHoliday.name}</strong> es el próximo <strong>{imminentHoliday.date}</strong>. Tu calendario ordinario prevé atención este día. Recomendamos configurar un bloqueo preventivo.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleDismissHoliday(imminentHoliday.date)}
                        className="text-sky-805 hover:text-sky-950 font-bold px-3 py-1.5 hover:bg-sky-100 rounded-lg transition-all text-[10px] uppercase cursor-pointer"
                      >
                        Ocultar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSuspDate(imminentHoliday.date);
                          setSuspType("full_day");
                          setConfigSubTab("emergency");
                        }}
                        className="bg-sky-900 text-white py-1.5 px-3 rounded-lg hover:bg-sky-850 font-semibold text-[10px] uppercase shadow-sm shrink-0 cursor-pointer"
                      >
                        Cerrar este día preventivamente
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 italic p-2">No se registran feriados inminentes en los próximos 35 días.</div>
                )}

                {/* Summary list of upcoming public holidays */}
                <div className="border rounded-xl overflow-hidden bg-white">
                  <div className="bg-slate-50 px-4 py-2 font-bold text-slate-800 border-b">
                    Próximos Feriados Oficiales (Chile)
                  </div>
                  <div className="divide-y max-h-[180px] overflow-y-auto pr-1">
                    {upcomingHolidays.slice(0, 5).map(h => (
                      <div key={h.date} className="p-3 flex justify-between items-center text-xs">
                        <div>
                          <strong className="text-slate-900 block">{h.name}</strong>
                          <span className="text-gray-400 font-mono">{h.date}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          h.diffDays <= 35 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"
                        }`}>
                          En {h.diffDays} días {h.diffDays <= 35 ? "⚠️ INMINENTE" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HOLIDAY ALERT TYPE SETTING (Email or Push) */}
                <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-xl space-y-3.5">
                  <div className="flex items-start gap-2.5">
                    <span className="text-base text-slate-700 font-bold shrink-0">🔔</span>
                    <div className="space-y-0.5">
                      <h5 className="font-bold text-slate-900 text-xs">Ajustes de Alerta Preventiva: Feriados Clínicos</h5>
                      <p className="text-slate-500 text-[10px] leading-relaxed">
                        Defina qué vía de comunicación prefiere recibir al aproximarse un evento feriado en Chile para programar bloqueos en su agenda médica oportunamente.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleSaveHolidayAlertSetting("email");
                        alert("📧 Preferencia de notificación por aproximación de feriado guardada: Correo Electrónico.");
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
                        holidayAlertType === "email"
                          ? "bg-slate-950 text-white border-slate-950 shadow-sm font-bold scale-[1.01]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-350 hover:bg-slate-50"
                      }`}
                    >
                      <span>✉️ Email</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleSaveHolidayAlertSetting("push");
                        alert("📱 Preferencia de notificación por aproximación de feriado guardada: Notificaciones Push.");
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer ${
                        holidayAlertType === "push"
                          ? "bg-slate-950 text-white border-slate-950 shadow-sm font-bold scale-[1.01] ring-1 ring-offset-1 ring-emerald-500"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-350 hover:bg-slate-50"
                      }`}
                    >
                      <span>📱 Push App</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 bg-white border border-slate-100 p-2.5 rounded-lg text-[10px] text-slate-600 leading-tight">
                    <span className={`block w-2 h-2 rounded-full shrink-0 ${holidayAlertType === "push" ? "bg-emerald-500 animate-ping" : "bg-sky-500"}`} />
                    <span>
                      {holidayAlertType === "push" ? (
                        <>Canal Activo: Se gatillarán advertencias <strong>Push de Alerta Inmediata</strong> al iniciar sesión si hay feriados inminentes.</>
                      ) : (
                        <>Canal Activo: El sistema enviará resúmenes <strong>clínicos vía Email</strong> previniendo solapamientos en días festivos.</>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: WEEKLY ORDINARY HOURS */}
            {configSubTab === "weekly_avail" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Days of the Week Selection */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-800 text-sm">1. Días Ordinarios de Consulta</h4>
                    <p className="text-gray-500 mb-2">Seleccione los días de la semana en los que usted abre disponibilidad para que el público reserve sesiones en el Portal de Pacientes:</p>
                    
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { num: 1, label: "Lunes" },
                        { num: 2, label: "Martes" },
                        { num: 3, label: "Miércoles" },
                        { num: 4, label: "Jueves" },
                        { num: 5, label: "Viernes" },
                        { num: 6, label: "Sábado" },
                        { num: 0, label: "Domingo" }
                      ].map(d => (
                        <button
                          type="button"
                          key={d.num}
                          onClick={() => handleToggleDayOfWeek(d.num)}
                          className={`px-3 py-2 rounded-xl border text-xs font-semibold select-none flex-1 min-w-[75px] text-center transition-all ${
                            availDays.includes(d.num)
                              ? "bg-slate-900 text-white border-slate-950 scale-102 shadow-sm"
                              : "bg-white text-gray-500 border-gray-200 hover:border-slate-300"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hourly Blocks Toggle */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-sm">2. Bloques Horarios por Día</h4>
                      <button
                        type="button"
                        onClick={() => setShowManageSlotsModal(true)}
                        className="px-2.5 py-1 text-[11px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-105 dark:hover:bg-blue-900/60 transition flex items-center gap-1 cursor-pointer shadow-3xs"
                      >
                        ⚙️ Ajustar Bloques
                      </button>
                    </div>
                    <p className="text-gray-500 mb-2">Desmarque o marque aquellos bloques específicos de consulta en los que ofrece atención médica:</p>
                    
                    <div className="grid grid-cols-2 gap-1.5">
                      {timeSlots.map(slot => (
                        <button
                          type="button"
                          key={slot}
                          onClick={() => handleToggleSlotAvailability(slot)}
                          className={`p-2 rounded-xl border text-[10px] font-mono text-center select-none transition-all ${
                            availSlots.includes(slot)
                              ? "bg-slate-900 text-white border-slate-950 shadow-xs"
                              : "bg-white text-gray-400 border-gray-200 hover:border-slate-200"
                          }`}
                        >
                          {slot} {availSlots.includes(slot) ? "🟢 ACTIVO" : "⚪ APAGADO"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-3 border-t items-center flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const standardSlots = ["18:00 - 18:45", "18:45 - 19:30", "19:30 - 20:15", "20:15 - 21:00"];
                      setTimeSlots(standardSlots);
                      setAvailSlots(standardSlots);
                      setAvailDays([1, 2, 3]);
                      localStorage.setItem("mindspace_defined_slots", JSON.stringify(standardSlots));
                      localStorage.setItem("mindspace_availability", JSON.stringify({ days: [1, 2, 3], slots: standardSlots }));
                      window.dispatchEvent(new Event("storage"));
                      alert("📥 Se ha aplicado y guardado el horario estándar: Lunes, Martes y Miércoles de 18:00 a 21:00 hrs (Sesiones de 45 min) sincronizado transversalmente en toda la plataforma.");
                    }}
                    className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-900 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-all text-xs font-bold cursor-pointer"
                  >
                    ⚡ Aplicar Jornada de 18:00 a 21:00 hrs (Lu, Ma, Mi)
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveWeeklyAvailability}
                    className="bg-slate-900 text-white px-5 py-2 rounded-xl hover:bg-slate-800 font-semibold transition-all shadow-md cursor-pointer"
                  >
                    Guardar Configuración Ordinaria
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: EMERGENCY SUSPENSIONS */}
            {configSubTab === "emergency" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Left Column Input details */}
                  <div className="lg:col-span-5 space-y-3 bg-slate-50 border p-4 rounded-xl">
                    <h4 className="font-bold text-slate-900 flex items-center gap-1">
                      <span>🚨</span> Formular Orden de Cierre de Agenda
                    </h4>

                    {/* Date picker */}
                    <div className="space-y-1">
                      <label className="text-gray-700 block font-semibold">Seleccionar Fecha de Incidencia</label>
                      <input
                        type="date"
                        required
                        value={suspDate}
                        onChange={(e) => setSuspDate(e.target.value)}
                        className="w-full p-2 rounded-xl border border-gray-200 bg-white"
                      />
                    </div>

                    {/* Mode selection Radio */}
                    <div className="space-y-1">
                      <label className="text-gray-700 block font-semibold">Magnitud de la Suspensión</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSuspType("full_day")}
                          className={`flex-1 p-2 border font-semibold rounded-lg text-center ${
                            suspType === "full_day" ? "bg-rose-900 text-white border-rose-950" : "bg-white text-gray-500"
                          }`}
                        >
                          Día Completo Closed
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuspType("specific_slots")}
                          className={`flex-1 p-2 border font-semibold rounded-lg text-center ${
                            suspType === "specific_slots" ? "bg-rose-900 text-white border-rose-950" : "bg-white text-gray-500"
                          }`}
                        >
                          Bloques Específicos
                        </button>
                      </div>
                    </div>

                    {/* Specific Slots selection checkboxes */}
                    {suspType === "specific_slots" && (
                      <div className="space-y-1 animate-in slide-in-from-top-1 duration-150">
                        <label className="text-gray-750 font-semibold block text-[10px] uppercase">Marcar Bloques Horarios que Cancelar:</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {availSlots.map(slot => (
                            <label 
                              key={slot} 
                              className={`p-2 rounded border flex items-center gap-1.5 cursor-pointer text-[10px] font-mono ${
                                suspSelectedSlots.includes(slot) ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-white text-gray-505"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={suspSelectedSlots.includes(slot)}
                                onChange={() => {
                                  if (suspSelectedSlots.includes(slot)) {
                                    setSuspSelectedSlots(suspSelectedSlots.filter(s => s !== slot));
                                  } else {
                                    setSuspSelectedSlots([...suspSelectedSlots, slot]);
                                  }
                                }}
                              />
                              {slot}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleExecuteEmergencySuspension}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-2.5 font-bold rounded-xl transition-all shadow-md text-center mt-2 cursor-pointer border border-rose-750"
                    >
                      ⚠️ EJECUTAR CIERRE Y LOGÍSTICA DE REAGENDAMIENTO
                    </button>
                  </div>

                  {/* Right Column suspensions list & suggestions actions log */}
                  <div className="lg:col-span-7 space-y-4">
                    
                    {/* Active suspensions checklist */}
                    <div className="border rounded-xl bg-white p-3 space-y-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-1 text-xs">
                        <span>🔓</span> Días/Bloques Clínicos Bloqueados Activos ({suspensions.length})
                      </h4>
                      {suspensions.length === 0 ? (
                        <p className="text-gray-400 italic text-xs pl-2">No se registran suspensiones de emergencia vigentes. El servicio está activo sin interrupciones.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-[105px] overflow-y-auto">
                          {suspensions.map(s => (
                            <div key={s.id} className="bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1 flex items-center justify-between gap-1.5 text-[10px]">
                              <span>📅 <strong>{s.date}</strong> | {s.type === "full_day" ? "Día Completo" : `Bloques: ${s.slots.length}`}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveSuspension(s.id)}
                                className="text-rose-600 hover:text-rose-800 font-bold ml-1 text-xs border border-transparent hover:border-rose-100 rounded bg-white px-1"
                                title="Reabrir atención público"
                              >
                                Reabrir
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Rescheduling پیشنهادات list */}
                    <div className="border border-emerald-100 rounded-xl bg-emerald-50/10 p-3 space-y-3">
                      <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                        <h4 className="font-bold text-emerald-800 flex items-center gap-1 text-xs">
                          <span>🎯</span> Propuestas de Reagendamiento Terapéutico ({rescheduleProposedList.filter(p => !p.processed).length} pendientes)
                        </h4>
                        <span className="text-[9px] bg-slate-900 text-white font-semibold px-2 py-0.5 rounded uppercase">Análisis Smart</span>
                      </div>
                      
                      {rescheduleProposedList.filter(p => !p.processed).length === 0 ? (
                        <p className="text-emerald-600/70 italic text-xs pl-2 text-center py-4">No se detectan propuestas de reagendamiento pendientes por procesar.</p>
                      ) : (
                        <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                          {rescheduleProposedList.filter(p => !p.processed).map(prop => (
                            <div key={prop.id} className="border border-emerald-100 bg-white rounded-xl p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-xs">
                              <div className="space-y-0.5">
                                <span className="font-bold text-slate-800">{prop.originalAppointment.patientName}</span>
                                <div className="text-[10px] text-gray-500 font-mono">
                                  Bloque cancelado: <span className="text-rose-500 font-bold">{prop.originalAppointment.date} @ {prop.originalAppointment.timeSlot}</span>
                                </div>
                                <div className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100 inline-block font-mono">
                                  Siguiente disponible: {prop.proposedDate} @ {prop.proposedSlot}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const alertTime = new Date().toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' });
                                    setNotificationLogs(prev => [
                                      `✉️ [${alertTime}] Notificación manual enviada a ${prop.originalAppointment.patientName}: Propuesta de reagendamiento reiterada para el ${prop.proposedDate} @ ${prop.proposedSlot}.`,
                                      ...prev
                                    ]);
                                    alert("✉️ Correo alternativo y alerta WhatsApp simulada enviada correctamente.");
                                  }}
                                  className="bg-gray-100 hover:bg-gray-250 border px-2 py-1 rounded text-[10px] font-semibold text-slate-600 cursor-pointer"
                                  title="Simular envío de oferta alternativa"
                                >
                                  Notificar Paciente
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmAlternativeBooking(prop.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px] font-semibold shadow-xs cursor-pointer border border-emerald-700"
                                >
                                  Reagendar y Consolidar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Simulated notifications dispatch tracking logs */}
                {notificationLogs.length > 0 && (
                  <div className="border rounded-xl bg-slate-900 text-slate-300 p-4 space-y-1.5 font-mono text-[10px]">
                    <div className="text-white font-bold border-b border-slate-800 pb-1 flex justify-between">
                      <span>📟 REGISTRO DE NOTIFICACIONES Y ALERTAS TACTICAS</span>
                      <button onClick={() => setNotificationLogs([])} className="text-[9px] hover:text-white underline">Purgar bitácora</button>
                    </div>
                    <div className="max-h-[120px] overflow-y-auto space-y-1 scrollbar-thin pr-1">
                      {notificationLogs.map((log, idx) => (
                        <div key={idx} className="leading-tight">{log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: APP & NOTIFICATIONS CONFIGURATION (AgendaPro Sync) */}
            {configSubTab === "notifications" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="bg-slate-50 dark:bg-slate-950 border dark:border-slate-800 p-4 rounded-xl flex items-start gap-3">
                  <div className="bg-slate-900 dark:bg-slate-800 p-2 text-white rounded-lg text-center leading-tight font-extrabold shrink-0">
                    SISTEMA
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">Configuración de Mensajería y Alertas Co-optimizadas</h4>
                    <p className="text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed text-xs">
                      Gestione el comportamiento del motor de notificaciones del consultorio digital. Estas conexiones actualizan autónomamente tanto al terapeuta como a los pacientes ante confirmaciones, anulaciones de emergencia o alertas preventivas estacionales de feriados en Chile.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Toggles Panel */}
                  <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-4 space-y-4 shadow-xs">
                    <h5 className="font-extrabold text-xs text-slate-800 dark:text-slate-205 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-slate-600" /> Canales de Transmisión Activos
                    </h5>
                    
                    <div className="space-y-3.5">
                      {/* Email template */}
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={notifEmailRes}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNotifEmailRes(val);
                            localStorage.setItem("notif_email_res", String(val));
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-750 text-slate-900 focus:ring-slate-900"
                        />
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">Confirmaciones por Correo Electrónico (Pacientes)</span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-405 block leading-normal">
                            Envía de forma autónoma correos de confirmación en tiempo real a pacientes al reservar o cancelar.
                          </span>
                        </div>
                      </label>

                      {/* Push device */}
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={notifPushRes}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNotifPushRes(val);
                            localStorage.setItem("notif_push_res", String(val));
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-750 text-slate-900 focus:ring-slate-900"
                        />
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">Alertas Push Inmediatas en PWA Móvil (Profesional)</span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-405 block leading-normal">
                            Notificaciones push directas en su teléfono frente a reservas directas del portal clínico de pacientes.
                          </span>
                        </div>
                      </label>

                      {/* Holiday alerts */}
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={notifHolidayPush}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNotifHolidayPush(val);
                            localStorage.setItem("notif_holiday_push", String(val));
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-750 text-slate-900 focus:ring-slate-900"
                        />
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">Previsión Estacional de Feriados Chilenos</span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-405 block leading-normal">
                            Despliega avisos tácticos 5 días antes de feriados nacionales chilenos para coordinar pre-bloqueos en la agenda.
                          </span>
                        </div>
                      </label>

                      {/* SMS WhatsApp sync */}
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={notifSmsRes}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNotifSmsRes(val);
                            localStorage.setItem("notif_sms_res", String(val));
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-750 text-slate-900 focus:ring-slate-900"
                        />
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">Mensajería SMS/WhatsApp de Urgencia (Simulador)</span>
                          <span className="text-[10px] text-gray-500 dark:text-slate-405 block leading-normal">
                            Gatilla mensajes de texto instantáneos ante suspensiones de bloques médicos o agendas sobrevenidas. (Cargos AWS SNS asociados).
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Interactivity Test Playground */}
                  <div className="bg-slate-50 dark:bg-slate-950 border dark:border-slate-850 rounded-xl p-4 space-y-4 flex flex-col justify-between">
                    <div className="space-y-2">
                      <h5 className="font-extrabold text-xs text-slate-800 dark:text-slate-205 uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-4 h-4 text-amber-500" /> Consola de Pruebas de Notificación
                      </h5>
                      <p className="text-[10.5px] text-slate-600 dark:text-slate-350 leading-relaxed">
                        Puede poner a prueba de inmediato la responsividad del motor web de notificaciones. Estos simuladores replican el comportamiento exacto de reservaciones reales ingresadas por su sitio web:
                      </p>
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const logTime = new Date().toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' });
                          setNotificationLogs(prev => [
                            `📱 [${logTime}] [PUSH] Simulación exitosa procesada: "Nueva reserva para Mañana a las 11:30 - Josefa Allende"`,
                            ...prev
                          ]);
                          alert("🔔 Alerta Push Simulada: Nueva sesión reservada por portal externo el día de mañana.");
                        }}
                        className="w-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white p-2.5 rounded-xl font-bold border border-slate-950 flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-101 active:scale-99"
                      >
                        <Smartphone className="w-4 h-4 text-emerald-400 animate-bounce" />
                        <span>Simular Notificación Push (Celular)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const logTime = new Date().toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' });
                          setNotificationLogs(prev => [
                            `📧 [${logTime}] [EMAIL CLIENTE] Correo de bienvenida enviado a: j.allende@gmail.com. Formato: Consulta de Enlace Constructivista.`,
                            ...prev
                          ]);
                          alert("✉️ Correo Electrónico Simulado: Correo despachado con confirmación de sesión y link de acceso E2EE.");
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 hover:bg-slate-50 hover:text-slate-900 text-slate-700 dark:text-slate-300 p-2.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-101 active:scale-99"
                      >
                        <Mail className="w-4 h-4 text-sky-500" />
                        <span>Simular Correo de Confirmación</span>
                      </button>
                    </div>

                    <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 p-2 rounded-lg text-[9.5px] text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5 leading-snug">
                      <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span>Sincronización PWA móvil: el navegador de su smartphone registrará alertas al mantener abierta la aplicación.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* VIEW SWITCHER / RESPONSIVE CONTROL BAR (AgendaPro layout inspiration) */}
      <div className="bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl flex flex-col sm:flex-row justify-between items-stretch sm:items-center border dark:border-slate-800 gap-3">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              viewMode === "calendar"
                ? "bg-slate-900 text-white shadow-md font-extrabold"
                : "text-slate-650 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-800/30"
            }`}
          >
            <CalendarDays className="w-4 h-4 text-emerald-500" /> 
            <span>Calendario Interactivo</span>
            <span className="bg-emerald-500 text-slate-950 justify-center text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tight hidden md:inline-block">AgendaPro Style</span>
          </button>
          
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              viewMode === "list"
                ? "bg-slate-900 text-white shadow-md font-extrabold"
                : "text-slate-650 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 bg-white/50 dark:bg-slate-800/30"
            }`}
          >
            <Layers className="w-4 h-4 text-sky-500" /> 
            <span>Buscador y Lista</span>
          </button>
        </div>
        
        {/* Responsive info pill for Dual Support */}
        <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] font-mono text-slate-500 font-bold bg-white dark:bg-slate-950 px-3 py-1.5 rounded-xl border dark:border-slate-850">
          <Smartphone className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          <span>Soporte Móvil Profesional Dual</span>
        </div>
      </div>

      {/* IMMINENT HOLIDAY CHILE CHANNELS ALERTER WIDGET */}
      {imminentHoliday && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <span className={`w-2 h-2 rounded-full ${holidayAlertType === "push" ? "bg-red-500 animate-ping" : "bg-sky-500 animate-pulse"}`} />
              <span>Alerta de Feriado Inminente en Chile ({holidayAlertType === "push" ? "⚠️ Alerta Push Activa" : "✉️ Recordatorio por Correo"})</span>
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              El feriado chileno de <strong>{imminentHoliday.name}</strong> ({imminentHoliday.date}) está a solo <strong>{imminentHoliday.diffDays} días</strong> de distancia. 
              {holidayAlertType === "push" ? (
                <span> Se ha desplegado esta advertencia como <strong>Notificación Push Directa</strong> para prevenir colisiones en su agenda laboral.</span>
              ) : (
                <span> Se ha programado un recordatorio automático en su <strong>Bandeja de Entrada de Correo Electrónico</strong>.</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
            <button
              type="button"
              onClick={() => handleDismissHoliday(imminentHoliday.date)}
              className="text-amber-800 hover:text-amber-950 font-bold px-3 py-1.5 hover:bg-amber-100 rounded-xl transition-all text-[10.5px] uppercase cursor-pointer border border-amber-300 bg-white"
            >
              Ignorar / Ocultar
            </button>
            <button
              type="button"
              onClick={() => {
                setSuspDate(imminentHoliday.date);
                setSuspType("full_day");
                setShowConfigPanel(true);
                setConfigSubTab("emergency");
              }}
              className="bg-amber-800 text-white hover:bg-amber-900 font-bold px-3 py-1.5 rounded-xl border border-amber-900 transition-all text-[10.5px] uppercase cursor-pointer"
            >
              Bloquear Agenda Preventivamente
            </button>
          </div>
        </div>
      )}

      {/* RENDER ACTIVE MODE LAYOUT */}
      {viewMode === "calendar" ? (
        /* INTERACTIVE WEEKLY OUTLOOK MODE */
        <div className="space-y-4 animate-in fade-in duration-250">
          {/* Weekly Selector Dashboard Header */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <CalendarDays className="w-5 h-5 text-slate-800" />
                  Agenda Semanal Clinica
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Seleccione un día para administrar citas en la cuadrícula de horas de consulta.
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <input 
                  type="date"
                  value={calendarSelectedDate}
                  onChange={(e) => { if (e.target.value) setCalendarSelectedDate(e.target.value); }}
                  className="p-1 px-2.5 rounded-xl border border-gray-200 text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const yyyy = today.getFullYear();
                    const mm = String(today.getMonth() + 1).padStart(2, "0");
                    const dd = String(today.getDate()).padStart(2, "0");
                    setCalendarSelectedDate(`${yyyy}-${mm}-${dd}`);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-205 text-slate-705 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Hoy
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setApptDate(calendarSelectedDate);
                    setShowAddAppt(true);
                  }}
                  className="bg-slate-900 border border-slate-950 text-white hover:bg-slate-800 text-xs font-bold px-4 py-1.5 rounded-xl flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Nuevo Agendamiento
                </button>
              </div>
            </div>
            
            {/* Week navigation toggler */}
            <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-gray-100 text-xs">
              <button
                type="button"
                onClick={() => {
                  const parts = calendarSelectedDate.split("-");
                  const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
                  dObj.setDate(dObj.getDate() - 7);
                  const y = dObj.getFullYear();
                  const m = String(dObj.getMonth() + 1).padStart(2, "0");
                  const d = String(dObj.getDate()).padStart(2, "0");
                  setCalendarSelectedDate(`${y}-${m}-${d}`);
                }}
                className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-bold bg-white px-3 py-1.5 rounded-xl border shadow-2xs cursor-pointer text-[10px]"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Semana</span> Anterior
              </button>
              
              <span className="font-extrabold text-slate-850 select-none uppercase tracking-wide text-[11px] sm:text-xs">
                {formatSpanishDate(calendarSelectedDate).split(",")[0]}
              </span>
              
              <button
                type="button"
                onClick={() => {
                  const parts = calendarSelectedDate.split("-");
                  const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
                  dObj.setDate(dObj.getDate() + 7);
                  const y = dObj.getFullYear();
                  const m = String(dObj.getMonth() + 1).padStart(2, "0");
                  const d = String(dObj.getDate()).padStart(2, "0");
                  setCalendarSelectedDate(`${y}-${m}-${d}`);
                }}
                className="flex items-center gap-1 text-slate-700 hover:text-slate-900 font-bold bg-white px-3 py-1.5 rounded-xl border shadow-2xs cursor-pointer text-[10px]"
              >
                <span className="hidden sm:inline">Semana</span> Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Horizontal 7 Days Matrix swipeable/scrollable bar */}
            <div className="grid grid-cols-7 gap-1 md:gap-2.5">
              {getWeekDates(calendarSelectedDate).map((dayMeta) => {
                const isSelected = dayMeta.dateStr === calendarSelectedDate;
                const isHoliday = CHILEAN_HOLIDAYS_2026_2027.some(h => h.date === dayMeta.dateStr);
                const holidayInfo = CHILEAN_HOLIDAYS_2026_2027.find(h => h.date === dayMeta.dateStr);
                const isSuspendedFull = suspensions.some(s => s.date === dayMeta.dateStr && s.type === "full_day");
                const dayActiveAppts = appointments.filter(a => normalizeDateStr(a.date) === normalizeDateStr(dayMeta.dateStr) && a.status !== "canceled").length;
                
                return (
                  <button
                    type="button"
                    key={dayMeta.dateStr}
                    onClick={() => setCalendarSelectedDate(dayMeta.dateStr)}
                    className={`p-2 rounded-xl border flex flex-col items-center justify-between transition-all cursor-pointer h-[75px] sm:h-[85px] hover:scale-102 ${
                      isSelected
                        ? "bg-slate-950 text-white border-slate-950 font-bold shadow-md ring-2 ring-slate-900/10"
                        : "bg-white border-gray-100 text-slate-800 hover:bg-slate-50"
                    } ${isSuspendedFull ? "bg-rose-50/70 border-rose-100 text-rose-900" : ""}`}
                  >
                    <span className={`text-[8.5px] font-bold tracking-wider ${isSelected ? "text-slate-300" : "text-gray-400"}`}>
                      {dayMeta.dayLabel}
                    </span>
                    
                    <span className="text-sm sm:text-base font-extrabold flex items-center gap-0.5">
                      {dayMeta.dayNum}
                      {isHoliday && <span title={`Feriado: ${holidayInfo?.name}`} className="text-[10px]">🇨🇱</span>}
                    </span>

                    <div className="flex gap-1 items-center justify-center min-h-[14px]">
                      {dayActiveAppts > 0 && (
                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded-full ${isSelected ? "bg-emerald-400 text-slate-950" : "bg-emerald-100 text-emerald-800"}`}>
                          {dayActiveAppts}
                        </span>
                      )}
                      {isSuspendedFull && (
                        <span className="text-[8px] bg-rose-500 text-white px-1 py-0.2 rounded font-bold" title="Bloqueo total">🔒</span>
                      )}
                      {dayActiveAppts === 0 && !isSuspendedFull && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-slate-600" : "bg-slate-200"}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACTIVE DAY TIMELINE VIEW */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-xs">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center border-b border-slate-805">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <h4 className="font-bold text-xs tracking-wide">
                  {formatSpanishDate(calendarSelectedDate)}
                </h4>
              </div>
              <span className="text-[9px] bg-slate-850 text-slate-320 font-mono px-2 py-0.5 rounded border border-slate-750">
                Línea Horaria de Atención
              </span>
            </div>

            {/* Warn cards overlay for suspended or holidays */}
            <div className="p-4 space-y-2 bg-slate-50 border-b">
              {CHILEAN_HOLIDAYS_2026_2027.some(h => h.date === calendarSelectedDate) && (
                <div className="bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-xl flex items-start gap-2 text-[11px] leading-relaxed">
                  <span>🇨🇱</span>
                  <div>
                    <strong>Feriado Nacional de Chile:</strong> Hoy es <strong>{CHILEAN_HOLIDAYS_2026_2027.find(h => h.date === calendarSelectedDate)?.name}</strong>. Tome en cuenta feriados para planificar sus bloqueos estacionales preventivos.
                  </div>
                </div>
              )}
              {suspensions.some(s => s.date === calendarSelectedDate && s.type === "full_day") && (
                <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[11px]">
                  <div className="flex items-start gap-2">
                    <span>⚠️</span>
                    <div>
                      <strong>Agenda Bloqueada por Emergencia:</strong> Suspensión de jornada completa activa para esta fecha.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const suspObj = suspensions.find(s => s.date === calendarSelectedDate && s.type === "full_day");
                      if (suspObj) handleRemoveSuspension(suspObj.id);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white hover:text-white px-3 py-1 text-[10px] font-bold rounded-lg border border-rose-700 cursor-pointer text-center whitespace-nowrap self-end sm:self-auto"
                  >
                    Desbloquear Todo el Día
                  </button>
                </div>
              )}
            </div>

            {/* TIMELINE LIST */}
            <div className="divide-y divide-gray-100 bg-white">
              {timeSlots.map((slot) => {
                const appt = appointments.find(a => normalizeDateStr(a.date) === normalizeDateStr(calendarSelectedDate) && a.timeSlot === slot);
                const isSuspended = suspensions.some(s => s.date === calendarSelectedDate && (s.type === "full_day" || (s.type === "slots" && s.slots?.includes(slot))));
                const specificSlotSuspension = suspensions.find(s => s.date === calendarSelectedDate && (s.type === "full_day" || (s.type === "slots" && s.slots?.includes(slot))));
                
                // Get standard availability for this slot
                const jsDayNum = new Date(calendarSelectedDate + "T12:00:00").getDay();
                const isOrdinarilyAvail = availDays.includes(jsDayNum) && availSlots.includes(slot);

                return (
                  <div 
                    key={slot}
                    className={`p-4 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between transition-all ${
                      appt ? "bg-slate-50/40" : "bg-white"
                    } ${isSuspended ? "bg-rose-50/20" : ""}`}
                  >
                    {/* Hourly block indicator column */}
                    <div className="flex items-center gap-2 shrink-0 min-w-[130px]">
                      <span className="p-1 px-2 rounded-xl bg-slate-100 text-slate-800 text-[10px] font-mono font-bold flex items-center gap-1.5 border border-slate-200">
                        <Clock className="w-3.5 h-3.5 text-slate-650" />
                        {slot}
                      </span>
                      
                      {isSuspended && (
                        <span className="bg-rose-100 text-rose-800 text-[9px] px-1.5 py-0.5 rounded-lg font-black uppercase">Bloqueado</span>
                      )}
                      {appt && appt.status === "completed" && (
                        <span className="bg-purple-100 text-purple-800 text-[9px] px-1.5 py-0.5 rounded-lg font-bold uppercase">Atendido</span>
                      )}
                      {appt && appt.status === "canceled" && (
                        <span className="bg-rose-105 text-rose-800 text-[9px] px-1.5 py-0.5 rounded-lg font-bold uppercase">Cancelado</span>
                      )}
                      {appt && appt.status === "scheduled" && (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] px-1.5 py-0.5 rounded-lg font-bold uppercase">Agendado</span>
                      )}
                      {!appt && !isSuspended && isOrdinarilyAvail && (
                        <span className="bg-emerald-50 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-lg font-bold uppercase">Libre</span>
                      )}
                      {!appt && !isSuspended && !isOrdinarilyAvail && (
                        <span className="bg-amber-50 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-lg font-bold uppercase" title="Horario fuera de agenda ordinaria">Ordenada Inactiva</span>
                      )}
                    </div>

                    {/* Middle slot content representing patients or block-outs */}
                    <div className="flex-1 min-w-0 w-full lg:w-auto">
                      {appt ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-slate-900 text-white font-extrabold text-[10px] flex items-center justify-center">
                              {appt.patientName ? appt.patientName.charAt(0).toUpperCase() : "P"}
                            </div>
                            <span className="font-extrabold text-slate-900 text-sm">{appt.patientName}</span>
                          </div>
                          <div className="text-[11px] text-gray-500">
                            <strong>Contacto:</strong> {appt.patientEmail} | 📞 {appt.patientPhone}
                          </div>
                          {appt.notes && (
                            <p className="text-[11px] text-gray-400 italic max-w-xl pl-1">
                              ✍️ {appt.notes}
                            </p>
                          )}
                        </div>
                      ) : isSuspended ? (
                        <div className="space-y-1 py-1">
                          <span className="font-bold text-rose-800 text-xs flex items-center gap-1">🛑 Suspensión Activa</span>
                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            Este horario está bloqueado temporalmente. Los pacientes en línea no podrán reservar a esta hora.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (specificSlotSuspension) {
                                if (specificSlotSuspension.type === "full_day") {
                                  alert("El bloque completo del día está desactivado. Desbloquee la jornada desde arriba.");
                                } else {
                                  handleRemoveSuspension(specificSlotSuspension.id);
                                }
                              }
                            }}
                            className="text-[10px] text-slate-800 hover:text-black font-extrabold underline cursor-pointer block"
                          >
                            Habilitar bloque particular
                          </button>
                        </div>
                      ) : !isOrdinarilyAvail ? (
                        <div className="text-gray-400 italic text-[10.5px] py-1 leading-normal">
                          Bloque fuera de plantilla usual. El portal de autoservicio no muestra este horario, pero puede agendar manualmente si prefiere.
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setApptDate(calendarSelectedDate);
                            setApptSlot(slot);
                            setShowAddAppt(true);
                          }}
                          className="w-full text-left p-2.5 border border-dashed border-gray-200 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all text-gray-400 text-[11px] flex items-center justify-between cursor-pointer group"
                        >
                          <span className="group-hover:text-slate-700 transition-colors">➕ Bloque de Turno Disponible - Presione para agregar paciente</span>
                          <span className="text-[9px] bg-slate-50 text-slate-400 rounded px-1.5 font-mono group-hover:bg-slate-900 group-hover:text-white group-hover:font-semibold">Reserva Directa</span>
                        </button>
                      )}
                    </div>

                    {/* Operational control columns */}
                    <div className="flex flex-wrap items-center gap-2.5 justify-end shrink-0 w-full lg:w-auto text-[10.5px]">
                      {appt ? (
                        <>
                          {/* Unified State Display (Non-interactive) */}
                          <div className="flex items-center gap-1.5 mr-2">
                            {renderUnifiedStateBadge(appt)}
                          </div>

                          {/* Teleconsult button & delete */}
                          <div className="flex items-center gap-1">
                             {appt.status === "scheduled" && (() => {
                              const atenderState = checkIsAtenderEnabled(appt.date, appt.timeSlot);
                              const uKey = getUnifiedStateKey(appt);
                              const isAtenderActive = appt.isCrisis === true || atenderState === "active";

                              if (isAtenderActive) {
                                const isPatientReady = uKey === "ready" || appt.isCrisis === true;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleJoinCallWithForceCheckIn(appt)}
                                    className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-750 rounded-xl flex items-center gap-1.5 font-bold shadow-md transition-all cursor-pointer hover:scale-102 active:scale-98 animate-pulse"
                                    title={isPatientReady ? "¡Ingresar a la consulta ahora! El paciente ya está en sala." : "¡Ingresar a la consulta! El paciente aún está por ingresar (su ingreso se confirmará automáticamente al unirse)."}
                                  >
                                    <Video className="w-3.5 h-3.5 text-white" />
                                    <span>Atender {isPatientReady ? "" : "(Pre-admitir)"}</span>
                                  </button>
                                );
                              } else {
                                return (
                                  <button
                                    type="button"
                                    disabled
                                    className="py-1.5 px-3 bg-emerald-600 text-white border border-emerald-700/50 rounded-xl flex items-center gap-1.5 font-bold cursor-not-allowed select-none opacity-40"
                                    title="Consulta inactiva: Se habilitará cuando empiece el bloque horario de la consulta."
                                  >
                                    <Video className="w-3.5 h-3.5 text-white" />
                                    <span>Atender</span>
                                  </button>
                                );
                              }
                            })()}

                            {appt.status === "completed" && (
                              appt.evolutionState === "draft" ? (
                                <button
                                  type="button"
                                  onClick={() => handleJoinCallWithForceCheckIn(appt)}
                                  className="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 border border-amber-600 rounded-xl flex items-center gap-1.5 font-bold shadow-md transition-all cursor-pointer text-white"
                                  title="La videollamada ha concluido. Presione para completar y firmar la evolución clínica de esta sesión."
                                >
                                  <Edit className="w-3.5 h-3.5 text-white animate-pulse" />
                                  <span>Completar</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleJoinCallWithForceCheckIn(appt)}
                                  className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 border border-indigo-750 rounded-xl flex items-center gap-1.5 font-bold shadow-sm transition-all cursor-pointer text-white"
                                  title="Ficha clínica firmada digitalmente y cerrada. Presione para ver el registro o redactar un anexo/adición."
                                >
                                  <FileText className="w-3.5 h-3.5 text-slate-100" />
                                  <span>Ver/Anexar</span>
                                </button>
                              )
                            )}
                            
                            <button
                              type="button"
                              onClick={() => handleDeleteAppointment(appt.id)}
                              className="p-2 border border-rose-200 hover:bg-rose-50 text-rose-500 rounded-xl transition-all cursor-pointer"
                              title="Borrar agendamiento clínico"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        !isSuspended && (
                          <button
                            type="button"
                            onClick={() => {
                              setApptDate(calendarSelectedDate);
                              setApptSlot(slot);
                              setShowAddAppt(true);
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-705 px-3.5 py-1.5 font-bold rounded-xl cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> Asignar Turno
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* TRADITIONAL LIST AND FILTER BLOCK (Original layouts) */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Search and Filters panel */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-slate-600" />
                Buscador y Filtros de Agenda
              </h3>
              <button
                onClick={() => setShowAddAppt(true)}
                className="bg-slate-900 border border-slate-950 text-white hover:bg-slate-800 transition-all text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1 shadow"
              >
                <Plus className="w-4 h-4" /> Asignar Turno Manual
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-medium text-slate-600">
              <div className="space-y-1">
                <label>Filtrar por Estado de Agenda</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="all">📅 Todos los Estados</option>
                  <option value="scheduled">🟢 Programados</option>
                  <option value="completed">🔵 Completados</option>
                  <option value="canceled">🔴 Cancelados</option>
                </select>
              </div>

              <div className="space-y-1">
                <label>Filtrar por Estado de Pago</label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="all">💳 Todos los Estados</option>
                  <option value="paid">✅ Pagados</option>
                  <option value="pending">⏳ Pendientes</option>
                </select>
              </div>

              <div className="space-y-1">
                <label>Filtrar por Fecha Específica</label>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Main agenda grid display */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="bg-slate-950 px-6 py-4 text-white flex justify-between items-center border-b">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-300" />
                <h4 className="text-sm font-bold">Agenda Visual de Turnos ({filteredAppts.length})</h4>
              </div>
              <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
                Vista Clínica Profesional
              </span>
            </div>

            {loading ? (
              <div className="p-8 space-y-4">
                <div className="h-12 bg-slate-50 rounded-xl animate-pulse"></div>
                <div className="h-12 bg-slate-50 rounded-xl animate-pulse"></div>
              </div>
            ) : filteredAppts.length === 0 ? (
              <div className="p-16 text-center text-slate-400 text-xs italic">
                Ningún turno clínico programado coincide con los filtros establecidos actualmente.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 font-sans">
                {filteredAppts.map((appt) => (
                  <div
                    key={appt.id}
                    className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:bg-slate-50/50 ${
                      appt.status === "completed" ? "opacity-75" : ""
                    }`}
                  >
                    {/* Date and patient info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-800 text-[10px] font-mono font-bold px-2 py-1 rounded">
                          📅 {appt.date}
                        </span>
                        <span className="bg-slate-900 text-white text-[10px] font-mono font-bold px-2 py-1 rounded flex items-center gap-1.5 shadow-sm">
                          <Clock className="w-3.5 h-3.5" /> {appt.timeSlot}
                        </span>
                      </div>

                      <div className="text-sm border-l-2 border-slate-250 pl-3">
                        <span className="font-bold text-slate-900 block">{appt.patientName}</span>
                        <span className="text-xs text-gray-650 flex items-center gap-1 block">
                          ✉️ {appt.patientEmail} | 📞 {appt.patientPhone}
                        </span>
                        <p className="text-xs text-gray-400 italic max-w-lg mt-1 block">
                          ✍️ Nota: {appt.notes}
                        </p>
                        {appt.rescheduleCount && appt.rescheduleCount > 0 ? (
                          <span className="inline-flex mt-2 items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 text-[9.5px] font-extrabold px-2 py-0.5 rounded-full shadow-3xs uppercase animate-pulse">
                            🔄 REAGENDADO: INTENTO {appt.rescheduleCount} / 3
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Status elements display */}
                    <div className="flex flex-wrap items-center mt-2 md:mt-0 gap-3 text-xs">
                      {/* Unified State Display (Non-interactive) */}
                      <div className="flex items-center gap-1.5 mr-2">
                        {renderUnifiedStateBadge(appt)}
                      </div>

                      {/* Actions video visual room join & purge */}
                      <div className="flex flex-wrap items-center gap-2">
                        {appt.status === "scheduled" && (() => {
                          const atenderState = checkIsAtenderEnabled(appt.date, appt.timeSlot);
                          const uKey = getUnifiedStateKey(appt);
                          const isAtenderActive = appt.isCrisis === true || atenderState === "active";

                          if (isAtenderActive) {
                            const isPatientReady = uKey === "ready" || appt.isCrisis === true;
                            return (
                              <button
                                onClick={() => handleJoinCallWithForceCheckIn(appt)}
                                className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-750 rounded-xl flex items-center gap-1.5 shadow-md transition-all text-[11px] font-bold cursor-pointer hover:scale-102 active:scale-98 animate-pulse"
                                title={isPatientReady ? "¡Unirse a la Videollamada Cifrada de Grado de Consulta activa!" : "¡Ingresar a la consulta! El paciente aún está por ingresar (su ingreso se confirmará automáticamente al unirse)."}
                              >
                                <Video className="w-3.5 h-3.5 text-slate-100" /> Atender Video {isPatientReady ? "" : "(Pre-admitir)"}
                              </button>
                            );
                          } else {
                            return (
                              <button
                                disabled
                                className="p-2 bg-emerald-600 text-white border border-emerald-700/50 rounded-xl flex items-center gap-1.5 text-[11px] font-bold cursor-not-allowed select-none opacity-40"
                                title="Consulta inactiva: Se habilitará cuando el bloque de horario empiece."
                              >
                                <Video className="w-3.5 h-3.5 text-white" /> Atender Video
                              </button>
                            );
                          }
                        })()}

                        {appt.status === "completed" && (
                          appt.evolutionState === "draft" ? (
                            <button
                              onClick={() => handleJoinCallWithForceCheckIn(appt)}
                              className="p-2 bg-amber-500 hover:bg-amber-600 text-white border border-amber-600 rounded-xl flex items-center gap-1.5 shadow-md transition-all text-[11px] font-bold cursor-pointer hover:scale-102 active:scale-98"
                              title="La videollamada ha concluido. Presione para completar y firmar la evolución clínica de esta sesión."
                            >
                              <Edit className="w-3.5 h-3.5 text-white animate-pulse" /> Completar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleJoinCallWithForceCheckIn(appt)}
                              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-750 rounded-xl flex items-center gap-1.5 shadow-sm transition-all text-[11px] font-bold cursor-pointer hover:scale-102 active:scale-98"
                              title="Ficha clínica firmada digitalmente y cerrada. Presione para ver el registro o redactar un anexo/adición."
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-100" /> Ver/Anexar
                            </button>
                          )
                        )}

                        <button
                          onClick={() => handleDeleteAppointment(appt.id)}
                          className="p-2 border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="Eliminar agendamiento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Appointment creation Modal */}
      {showAddAppt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 border border-gray-100 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-1.5 border-b pb-2">
              <Calendar className="w-5 h-5 text-slate-800" />
              Asignar Turno Terapéutico
            </h3>

            <form onSubmit={handleCreateManualAppointment} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-gray-700 block">Seleccionar Paciente</label>
                <select
                  required
                  value={selectedPatId}
                  onChange={(e) => setSelectedPatId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-200 bg-white"
                >
                  <option value="">-- Elige un Paciente --</option>
                  {patients.map((pat) => (
                    <option key={pat.id} value={pat.id}>{pat.name} ({pat.email})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700 block">Fecha</label>
                  <input
                    type="date"
                    required
                    value={apptDate}
                    onChange={(e) => setApptDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700 block">Valor Ajustado (CLP $)</label>
                  <input
                    type="number"
                    required
                    value={apptPrice}
                    onChange={(e) => setApptPrice(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-gray-200"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 block">Espacio Horario</label>
                <div className="grid grid-cols-2 gap-1.5 text-slate-800">
                  {timeSlots.map((slot) => (
                    <button
                      type="button"
                      key={slot}
                      onClick={() => setApptSlot(slot)}
                      className={`p-2 rounded-lg border text-[10px] font-mono text-center cursor-pointer ${apptSlot === slot ? "bg-slate-900 text-white" : "border-gray-200 text-gray-600 bg-white hover:bg-slate-50"}`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-gray-700 block">Notas de Consulta Internas (Prescripción/Motivo)</label>
                <textarea
                  placeholder="Ej: Ansiedad recurrente o trastorno adaptativo"
                  value={apptNotes}
                  rows={2}
                  onChange={(e) => setApptNotes(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-xl resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddAppt(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-705 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Confirmar Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage defined slots Modal */}
      {showManageSlotsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl p-6 border border-slate-150 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-200">
            
            <div className="flex justify-between items-start border-b dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600 animate-pulse" />
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                    Ajustar Bloques de Disponibilidad
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Defina los bloques de horario disponibles para realizar consultas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManageSlotsModal(false);
                  setEditingSlotIndex(null);
                }}
                className="p-1 px-[10px] hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition font-extrabold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* CURRENT SLOTS LIST */}
              <div className="space-y-2">
                <span className="font-bold text-gray-700 dark:text-gray-300 block">Bloques Definidos Actualmente ({timeSlots.length})</span>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 border border-gray-100 dark:border-slate-800 p-2 rounded-xl bg-slate-50/50 dark:bg-slate-950/20">
                  {timeSlots.map((slot, index) => {
                    const isActive = availSlots.includes(slot);
                    const isBeingEdited = editingSlotIndex === index;
                    
                    return (
                      <div 
                        key={slot} 
                        className={`flex items-center justify-between p-2 rounded-lg border text-[11px] transition-all ${
                          isBeingEdited 
                            ? "bg-blue-50/70 border-blue-300 dark:bg-blue-950/20 dark:border-blue-800" 
                            : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-700 dark:text-slate-300 font-bold">{slot}</span>
                          <span className="text-[10px] scale-90 px-1.5 py-0.5 rounded-full font-sans font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {isActive ? "🟢 Visible en agenda" : "⚪ Oculto ordinariamente"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditSlot(index)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition cursor-pointer"
                            title="Editar bloque"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSlot(index)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/45 rounded-md transition cursor-pointer flex items-center justify-center"
                            title="Eliminar bloque"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ADD OR EDIT FORM */}
              <div className="p-4 rounded-2xl border border-blue-150/60 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/10 space-y-3">
                <span className="font-bold text-blue-800 dark:text-blue-400 block uppercase tracking-wide text-[10px]">
                  {editingSlotIndex !== null ? "📝 Modificar Bloque Seleccionado" : "⚡ Generar Nuevo Bloque Horario"}
                </span>

                <div className="grid grid-cols-2 gap-3 text-slate-900 dark:text-slate-100">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 block">HORA INICIO:</label>
                    <input
                      type="time"
                      value={editingSlotIndex !== null ? editingSlotStart : newSlotStart}
                      onChange={(e) => {
                        if (editingSlotIndex !== null) {
                          setEditingSlotStart(e.target.value);
                        } else {
                          setNewSlotStart(e.target.value);
                        }
                      }}
                      className="w-full p-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-center text-xs dark:text-white text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 block">HORA TÉRMINO:</label>
                    <input
                      type="time"
                      value={editingSlotIndex !== null ? editingSlotEnd : newSlotEnd}
                      onChange={(e) => {
                        if (editingSlotIndex !== null) {
                          setEditingSlotEnd(e.target.value);
                        } else {
                          setNewSlotEnd(e.target.value);
                        }
                      }}
                      className="w-full p-2 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 font-mono text-center text-xs dark:text-white text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-1.5">
                  {editingSlotIndex !== null ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingSlotIndex(null)}
                        className="flex-1 py-2 font-bold rounded-xl border border-gray-200 text-gray-600 bg-white dark:bg-slate-900 dark:border-slate-850 dark:text-slate-350 hover:bg-gray-50 dark:hover:bg-slate-800 transition text-[10px] uppercase"
                      >
                        Cancelar Edición
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEditSlot}
                        className="flex-1 py-2 font-extrabold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm text-[10px] uppercase"
                      >
                        Guardar Cambios
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddNewSlot}
                      className="w-full py-2.5 font-extrabold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-850 dark:hover:bg-slate-100 transition flex items-center justify-center gap-1 uppercase tracking-wider text-[10px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar Bloque Nuevo
                    </button>
                  )}
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-2 pt-3 mt-4 border-t dark:border-slate-805">
              <button
                type="button"
                onClick={() => {
                  setShowManageSlotsModal(false);
                  setEditingSlotIndex(null);
                }}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2.5 rounded-xl font-bold transition-all shadow-md text-[10px] uppercase cursor-pointer text-center"
              >
                Cerrar y Ver Agenda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security note regarding videocalls */}
      <div className="border border-slate-200 bg-slate-50/50 p-4 rounded-xl flex items-start gap-2.5 text-xs text-slate-600">
        <ShieldAlert className="w-5 h-5 text-slate-800 shrink-0" />
        <div>
          <strong>Protocolo de Cifrado de Videollamada de Consulta:</strong> Las videocomunicaciones de este gestor clínico se firman con un token de criptografía simétrica <strong>AES-GCM de 256 bits</strong> en tránsito y en servidor en tiempo de handshake. Cumple con los estándares HIPAA internacionales para la confidencialidad absoluta del paciente psicoterapéutico.
        </div>
      </div>
    </div>
  );
}
