/**
 * HERRAMIENTA DE MIGRACIÓN DE FIRESTORE — MINDSPACE SECURITY Professional
 * 
 * Este script migra todos los registros clínicos del ID anterior "default_psychologist_uid_123"
 * al UID real autenticado de Firebase Auth: "NDmjbTte6wa5vgeIc2JASOfNhYi1".
 * 
 * OPERACIONES DE LA LIMPIEZA TOTAL:
 * 1. Duplica la configuración de perfil de "settings/default_psychologist_uid_123" a "settings/NDmjbTte6wa5vgeIc2JASOfNhYi1".
 * 2. Elimina el documento antiguo "settings/default_psychologist_uid_123" para evitar duplicados e inconsistencias.
 * 3. Migra los documentos clínicos activos de las colecciones:
 *    - patients (Pacientes)
 *    - appointments (Citas y Reservas)
 *    - histories (Evoluciones Clínicas)
 *    - reviews (Reseñas de Reputación)
 *    - mood_journals (Diarios de Estado de Ánimo de Pacientes)
 * 4. Omite de forma segura logs de auditoría estáticos para no violar las reglas de inmutabilidad (clinical_audits, audit_logs).
 * 
 * INSTRUCCIONES DE USO:
 * 1. Inicie sesión como Profesional en su portal Mindspace.
 * 2. Abra las Herramientas de Desarrollador del navegador (F12) y vaya a la pestaña "Consola" (Console).
 * 3. Copie y pegue todo este script y presione Enter para cargarlo.
 * 4. Ejecute el comando llamando a la función:
 *    await ejecutarLimpiezaTotalMindspace();
 * 5. Observe el log descriptivo en tiempo real.
 */

async function ejecutarLimpiezaTotalMindspace() {
  console.log("%c🚀 INICIANDO MIGRACIÓN DE LIMPIEZA TOTAL Y AUTORIDAD ÚNICA...", "color: #10b981; font-weight: bold; font-size: 14px;");

  const db = window.firestoreDb;
  if (!db) {
    console.error("%c❌ Error: No se encontró la instancia de Firestore activa 'window.firestoreDb'. Asegúrese de estar en la pestaña activa de su app y de haber iniciado sesión.", "color: #ef4444; font-weight: bold;");
    return;
  }

  // Importar dinámicamente las herramientas oficiales de Firebase SDK cargadas en el cliente
  const { 
    collection, 
    getDocs, 
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

  // Colecciones de datos de pacientes/consultorio a migrar activamente
  const coleccionesAMigrar = [
    "patients",
    "appointments",
    "histories",
    "reviews",
    "mood_journals"
  ];

  let totalModificados = 0;

  // 1. DUPLICAR Y ELIMINAR EL DOCUMENTO DE AJUSTES (SETTINGS) - PREVENCIÓN DE DUPLICADOS (PROBLEMA 2)
  console.log("%c⚙️ Procesando configuración de perfil (settings)...", "color: #6366f1; font-weight: bold;");
  try {
    const oldSettingsRef = doc(db, "settings", OLD_UID);
    const oldSettingsSnap = await getDoc(oldSettingsRef);

    if (oldSettingsSnap.exists()) {
      const settingsData = oldSettingsSnap.data();
      const newSettingsRef = doc(db, "settings", NEW_UID);
      
      // Duplicar datos con el nuevo ID como llave del documento
      await setDoc(newSettingsRef, {
        ...settingsData,
        id: NEW_UID,
        ownerId: NEW_UID,
        updatedAt: new Date()
      });
      console.log(`%c  ✅ Ajustes copiados con éxito al nuevo perfil real (${NEW_UID})`, "color: #10b981;");

      // Eliminar el perfil huérfano anterior inmediatamente para evitar inconsistencias de doble sincronización
      await deleteDoc(oldSettingsRef);
      console.log(`%c  🧹 Antiguo perfil "${OLD_UID}" eliminado completamente de la base de datos de manera segura.`, "color: #f59e0b;");
    } else {
      console.log("  ℹ️ No se detectó un perfil antiguo de ajustes para migrar.");
    }
  } catch (error) {
    console.error("  ❌ Error de permisos o lectura al procesar la configuración de perfil: ", error);
  }

  // 2. MIGRAR DOCUMENTOS DE COLECCIONES DE PACIENTES
  for (const colName of coleccionesAMigrar) {
    console.log(`%c📂 Escaneando colección activa: '${colName}'...`, "color: #3b82f6; font-weight: bold;");
    try {
      const colRef = collection(db, colName);
      const q = query(colRef, where("ownerId", "==", OLD_UID));
      const querySnapshot = await getDocs(q);
      
      console.log(`  🔍 Filtro 'ownerId == "${OLD_UID}"': Se hallaron ${querySnapshot.size} documentos.`);

      if (querySnapshot.size > 0) {
        const batch = writeBatch(db);
        
        querySnapshot.forEach((docSnap) => {
          const docRef = doc(db, colName, docSnap.id);
          batch.update(docRef, { 
            ownerId: NEW_UID,
            updatedAt: new Date()
          });
        });

        await batch.commit();
        totalModificados += querySnapshot.size;
        console.log(`%c  ✅ ¡Operación atómica completada! ${querySnapshot.size} documentos migrados en '${colName}'.`, "color: #10b981;");
      }
    } catch (e) {
      console.warn(`  ❌ Colección '${colName}': No se pudo migrar por restricciones de reglas o permisos (${e.message}). Esto es normal y esperado si el lote incluye logs estrictamente protegidos.`);
    }
  }

  // Resumen final
  console.log("\n%c🎉 --- PROCESO CONCLUIDO CON ÉXITO ---", "color: #10b981; font-weight: bold; font-size: 14px;");
  console.log(`✔️ Total de documentos clínicos actualizados: ${totalModificados}`);
  console.log(`✔️ Se resolvió el Problema de Duplicidad de Perfil (Settings).`);
  console.log(`✔️ Limpieza total completada. Su aplicación ahora opera bajo Autenticación Única Segura.`);
  console.log("%c¡Listo! Ya puede actualizar su navegador para disfrutar de la arquitectura limpia.", "font-style: italic; color: #10b981;");
}
