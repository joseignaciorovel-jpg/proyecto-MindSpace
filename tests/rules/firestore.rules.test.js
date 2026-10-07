import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

const projectId = "demo-mindspace";
const rulesPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../firestore.rules");
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

test("solo el profesional propietario puede leer la ficha y la cita", async () => {
  await seed("patients/patient-1", { ownerId: "clinician-1", name: "Paciente ficticio" });
  await seed("appointments/appointment-1", { ownerId: "clinician-1", status: "pending" });

  const ownerDb = testEnv.authenticatedContext("clinician-1").firestore();
  const otherDb = testEnv.authenticatedContext("clinician-2").firestore();
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(ownerDb, "patients/patient-1")));
  await assertSucceeds(getDoc(doc(ownerDb, "appointments/appointment-1")));
  await assertFails(getDoc(doc(otherDb, "patients/patient-1")));
  await assertFails(getDoc(doc(otherDb, "appointments/appointment-1")));
  await assertFails(getDoc(doc(anonymousDb, "appointments/appointment-1")));
});

test("lecturas anónimas y escrituras de paciente no autenticado se deniegan", async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymousDb, "unknown_collection/record-1")));
  await assertFails(
    setDoc(doc(anonymousDb, "appointments/fake-appointment"), {
      ownerId: "clinician-1",
      status: "scheduled",
    }),
  );
  await assertFails(
    setDoc(doc(anonymousDb, "mood_journals/fake-log"), {
      ownerId: "patient-1",
      mood: 5,
    }),
  );
});

test("el UID heredado solo puede acceder a documentos de su titular", async () => {
  await seed("histories/legacy-record", {
    ownerId: "default_psychologist_uid_123",
    patientId: "patient-1",
    note: "Dato ficticio",
  });

  const mappedOwnerDb = testEnv
    .authenticatedContext("NDmjbTte6wa5vgeIc2JASOfNhYi1")
    .firestore();
  const otherDb = testEnv.authenticatedContext("clinician-2").firestore();

  await assertSucceeds(getDoc(doc(mappedOwnerDb, "histories/legacy-record")));
  await assertFails(getDoc(doc(otherDb, "histories/legacy-record")));
});

test("solo una reseña con consentimiento explícito es pública", async () => {
  await seed("reviews/public-review", { publicConsent: true, text: "Reseña ficticia" });
  await seed("reviews/private-review", { publicConsent: false, text: "Reseña privada ficticia" });

  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(anonymousDb, "reviews/public-review")));
  await assertFails(getDoc(doc(anonymousDb, "reviews/private-review")));
});

test("los bloques de agenda públicos no exponen citas y validan sus campos", async () => {
  await seed("public_booked_slots/slot-1", {
    id: "slot-1",
    date: "2026-12-01",
    timeSlot: "10:00",
    status: "scheduled",
    ownerId: "clinician-1",
  });

  const anonymousDb = testEnv.unauthenticatedContext().firestore();
  const ownerDb = testEnv.authenticatedContext("clinician-1").firestore();

  await assertSucceeds(getDoc(doc(anonymousDb, "public_booked_slots/slot-1")));
  await assertFails(
    setDoc(doc(anonymousDb, "public_booked_slots/slot-2"), {
      id: "slot-2",
      date: "2026-12-01",
      timeSlot: "11:00",
      status: "scheduled",
      ownerId: "clinician-1",
      patientName: "No debe publicarse",
    }),
  );
  await assertSucceeds(
    setDoc(doc(ownerDb, "public_booked_slots/slot-2"), {
      id: "slot-2",
      date: "2026-12-01",
      timeSlot: "11:00",
      status: "scheduled",
      ownerId: "clinician-1",
    }),
  );
});

test("los logs de auditoría no se pueden editar ni borrar desde cliente", async () => {
  await seed("audit_logs/log-1", {
    ownerId: "clinician-1",
    action: "read",
  });

  const ownerDb = testEnv.authenticatedContext("clinician-1").firestore();
  const logRef = doc(ownerDb, "audit_logs/log-1");

  await assertSucceeds(getDoc(logRef));
  await assertFails(updateDoc(logRef, { action: "rewritten" }));
  await assertFails(deleteDoc(logRef));
});

test("un usuario no provisionado no puede autoasignarse rol de profesional", async () => {
  const unprovisionedDb = testEnv.authenticatedContext("clinician-2").firestore();

  await assertFails(
    setDoc(doc(unprovisionedDb, "settings/clinician-2"), {
      ownerId: "clinician-2",
      therapistName: "Profesional no provisionado",
    }),
  );
  await assertFails(
    setDoc(doc(unprovisionedDb, "patients/fake-patient"), {
      ownerId: "clinician-2",
      name: "Paciente ficticio",
    }),
  );
});
