/**
 * HERRAMIENTA DE MIGRACIÓN DE FIRESTORE — MINDSPACE SECURITY
 * 
 * Este script migra todos los registros cuyo 'ownerId' actual es "default_psychologist_uid_123"
 * al UID real del especialista de Firebase Auth: "NDmjbTte6wa5vgeIc2JASOfNhYi1".
 * 
 * COLECCIONES EN COBERTURA CON REGLAS DE FIRESTORE:
 * - patients
 * - appointments
 * - histories
 * - settings
 * - audit_logs
 * - clinical_audits
 * - reviews
 * - mood_journals
 * 
 * INSTRUCCIONES DE USO (CONSOLA DEL NAVEGADOR):
 * 1. Inicie sesión como Profesional en su portal MindSpace.
 * 2. Abra las Herramientas de Desarrollador (F12) y vaya a la pestaña "Consola".
 * 3. Copie y pegue todo el código de este script.
 * 4. Ejecute el comando llamando a la función: `await iniciarMigracionDigital();`
 * 5. Observe la bitácora detallada de cambios en la consola.
 */

async function iniciarMigracionDigital() {
  console.log("🚀 Iniciando migración segura de datos en Firestore...");
  
  // Intentar obtener instancias globales del navegador creadas por la App
  const firebaseApp = window.firebaseApp;
  const db = window.firestoreDb || (window.db); // Búsqueda de referencia activa al objeto de base de datos
  
  if (!db) {
    console.error("❌ No se encontró instancia activa de Firestore ('db' o 'firestoreDb') en window. Por favor ejecute en la consola de la app cargada.");
    return;
  }

  // Importar funciones auxiliares de Firebase cargadas en el cliente
  // Si no están directas, intentamos usar las importaciones dinámicas
  const { 
    collection, 
    getDocs, 
    updateDoc, 
    doc, 
    writeBatch, 
    query, 
    where,
    getDoc,
    setDoc,
    deleteDoc
  } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

  const OLD_UID = "default_psychologist_uid_123";
  const NEW_UID = "NDmjbTte6wa5vgeIc2JASOfNhYi1";

  const colecciones = [
    "patients",
    "appointments",
    "histories",
    "audit_logs",
    "clinical_audits",
    "reviews",
    "mood_journals"
  ];

  let totalProcesados = 0;
  let totalModificados = 0;

  // 1. MIGRAR CONFIGURACIONES DE PERFIL (SETTINGS)
  console.log("⚙️ Migrando configuración de consultorio (settings)...");
  try {
    const oldSettingsRef = doc(db, "settings", OLD_UID);
    const oldSettingsSnap = await getDoc(oldSettingsRef);

    if (oldSettingsSnap.exists()) {
      const settingsData = oldSettingsSnap.data();
      const newSettingsRef = doc(db, "settings", NEW_UID);
      
      // Duplicar datos al nuevo UID real
      await setDoc(newSettingsRef, {
        ...settingsData,
        id: NEW_UID,
        ownerId: NEW_UID,
        updatedAt: new Date()
      });
      console.log(`✅ Configuración de perfil duplicada exitosamente al nuevo ID: ${NEW_UID}`);
    } else {
      console.log("ℹ️ No se detectó perfil de settings antiguo para copiar.");
    }
  } catch (error) {
    console.error("❌ Error migrando configuración:", error);
  }

  // 2. MIGRAR RESTO DE COLECCIONES DE DATOS CLINICOS
  for (const colName of colecciones) {
    console.log(`📂 Escaneando colección: '${colName}'...`);
    try {
      const colRef = collection(db, colName);
      
      // Consultar documentos donde ownerId coincide con el antiguo ID hardcodeado
      const q = query(colRef, where("ownerId", "==", OLD_UID));
      const querySnapshot = await getDocs(q);
      
      console.log(`🔍 Se encontraron ${querySnapshot.size} documentos para migrar en '${colName}'.`);

      if (querySnapshot.size > 0) {
        const batch = writeBatch(db);
        
        querySnapshot.forEach((docSnap) => {
          const docRef = doc(db, colName, docSnap.id);
          batch.update(docRef, { 
            ownerId: NEW_UID,
            updatedAt: new Date()
          });
          totalProcesados++;
        });

        await batch.commit();
        totalModificados += querySnapshot.size;
        console.log(`✅ ¡Éxito! Migrados ${querySnapshot.size} documentos en '${colName}'.`);
      }
    } catch (e) {
      console.error(`❌ Error migrando registros en la colección '${colName}':`, e.message);
    }
  }

  console.log(`\n🎉 --- RESUMEN DE MIGRACIÓN COMPLETA ---`);
  console.log(`✔️ Total documentos escaneados e identificados: ${totalProcesados}`);
  console.log(`✔️ Total documentos modificados de forma segura con el nuevo UID: ${totalModificados}`);
  console.log(`👉 Nota: Una vez verifique los datos, puede liminar el documento antiguo de configuración settings "${OLD_UID}" de forma segura.`);
}
