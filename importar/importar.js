// importar/importar.js
import { db, collection, getDocs, writeBatch, doc, serverTimestamp } from '../js/firebase-config.js';

let datosProcesados = [];

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('excelFileInput');
    const btnSubida = document.getElementById('btnIniciarSubida');
    const selectDepto = document.getElementById('selectDepartamento');
    const contenedorProgreso = document.getElementById('contenedorProgreso');
    const btnBorrarTodo = document.getElementById('btnBorrarTodo');

    if (btnBorrarTodo) {
        btnBorrarTodo.addEventListener('click', async () => {
            if (confirm("⚠️ ¿Estás COMPLETAMENTE SEGURO de eliminar TODOS los registros de la base de datos? Esta acción no se puede deshacer.")) {
                await eliminarBaseDeDatosCompleta();
            }
        });
    }

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const nombrePrimeraHoja = workbook.SheetNames[0];
            const sheet = workbook.Sheets[nombrePrimeraHoja];
            
            // Leemos como matriz de arreglos (header: 1) para evitar depender de nombres de columnas
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            datosProcesados = [];
            const deptoSeleccionado = selectDepto ? selectDepto.value : 'BIENESTAR SOCIAL 2026';

            // Determinar si la fila 0 es encabezado o datos
            // En bienestar, la celda [0] o [1] suele ser el tipo de gestión o un folio como "BS0001"
            let startIndex = 0;
            if (rows.length > 0) {
                const primerElemento = String(rows[0][0] || '').toUpperCase();
                if (primerElemento.includes('TIPO') || primerElemento.includes('FOLIO')) {
                    startIndex = 1; // Salta la fila de encabezados si existe (ej. Pueblo y Territorio)
                }
            }

            for (let i = startIndex; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length === 0) continue;

                // Mapeo por posición exacta de columna según la estructura de tus excels
                let tipoGest = r[0] ? String(r[0]).trim() : deptoSeleccionado;
                let folioVal = r[1] ? String(r[1]).trim() : `S/F-${i}`;
                
                // Formatear fecha de Excel de manera segura
                let fechaVal = new Date().toISOString().split('T')[0];
                if (r[2]) {
                    if (typeof r[2] === 'number') {
                        // Conversión de fecha serial de Excel
                        const fechaExcel = XLSX.SSF.parse_date_code(r[2]);
                        if (fechaExcel) {
                            fechaVal = `${fechaExcel.y}-${String(fechaExcel.m).padStart(2, '0')}-${String(fechaExcel.d).padStart(2, '0')}`;
                        }
                    } else {
                        fechaVal = String(r[2]).split('T')[0];
                    }
                }

                let ubiVal = r[3] ? String(r[3]).trim().toUpperCase() : 'S/N';
                let nombreVal = r[4] ? String(r[4]).trim().toUpperCase() : 'SIN NOMBRE';
                let cargoVal = r[5] ? String(r[5]).trim().toUpperCase() : 'CIUDADANO';
                let clasifVal = r[6] ? String(r[6]).trim().toUpperCase() : 'GENERAL';
                let reqVal = r[7] ? String(r[7]).trim().toUpperCase() : 'SIN ESPECIFICAR';
                let detallesVal = r[8] ? String(r[8]).trim() : '';
                let referenciasVal = r[9] ? String(r[9]).trim() : 'S/N';
                let rutaVal = r[10] ? String(r[10]).trim().toUpperCase() : 'GENERAL';
                let prioridadVal = r[11] ? String(r[11]).trim().toUpperCase() : 'NORMAL';
                let statusVal = r[12] ? String(r[12]).trim().toUpperCase() : 'PENDIENTE';
                let observacionesVal = r[13] ? String(r[13]).trim() : '';

                // Omitir filas totalmente vacías
                if (folioVal === 'S/F' && nombreVal === 'SIN NOMBRE') continue;

                const registro = {
                    tipoGestion: tipoGest || deptoSeleccionado,
                    folio: folioVal,
                    fecha: fechaVal,
                    nombre: nombreVal,
                    cargo: cargoVal,
                    referencias: referenciasVal,
                    clasificacion: clasifVal,
                    requerimiento: reqVal,
                    detalles: detallesVal,
                    ruta: rutaVal,
                    status: statusVal,
                    observaciones: observacionesVal,
                    createdAt: serverTimestamp()
                };

                if (deptoSeleccionado.includes('BIENESTAR')) {
                    registro.colonia = ubiVal;
                    registro.prioridad = prioridadVal || 'NORMAL';
                } else {
                    registro.localidad = ubiVal;
                }

                datosProcesados.push(registro);
            }

            document.getElementById('nombreArchivo').textContent = `${file.name} (${nombrePrimeraHoja})`;
            document.getElementById('resumenRegistros').textContent = `${datosProcesados.length} registros listos para el departamento: ${deptoSeleccionado}`;
            document.getElementById('panelCarga').classList.remove('hidden');
            
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion(`Archivo procesado con éxito. ${datosProcesados.length} registros listos.`, 'success');
            }
        };
        reader.readAsArrayBuffer(file);
    });

    if (btnSubida) {
        btnSubida.addEventListener('click', async () => {
            if (datosProcesados.length === 0) {
                if (window.mostrarNotificacion) window.mostrarNotificacion("No hay registros cargados para subir.", "warning");
                return;
            }

            btnSubida.disabled = true;
            btnSubida.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Subiendo a Firebase...';
            
            if (contenedorProgreso) contenedorProgreso.classList.remove('hidden');

            const barra = document.getElementById('barraProgreso');
            const textoPorcentaje = document.getElementById('textoPorcentaje');

            try {
                const tamanoLote = 100;
                const total = datosProcesados.length;
                let subidos = 0;

                for (let i = 0; i < total; i += tamanoLote) {
                    const batch = writeBatch(db);
                    const chunk = datosProcesados.slice(i, i + tamanoLote);

                    chunk.forEach((item) => {
                        const nuevoDocRef = doc(collection(db, "solicitudes"));
                        batch.set(nuevoDocRef, item);
                    });

                    await batch.commit();
                    subidos += chunk.length;

                    const porcentaje = Math.round((subidos / total) * 100);
                    if (barra) barra.style.width = `${porcentaje}%`;
                    if (textoPorcentaje) textoPorcentaje.textContent = `${porcentaje}% (${subidos}/${total} registros)`;
                }

                if (window.mostrarNotificacion) window.mostrarNotificacion("¡Carga completada exitosamente en Firebase Firestore!", "success");
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 2000);
            } catch (error) {
                console.error("Error detallado en la subida:", error);
                if (window.mostrarNotificacion) window.mostrarNotificacion("Ocurrió un error al subir los registros. Revisa la consola.", "error");
                btnSubida.disabled = false;
                btnSubida.innerHTML = '<i class="fa-solid fa-upload mr-2"></i> Subir a Firebase';
            }
        });
    }
});

async function eliminarBaseDeDatosCompleta() {
    const btnBorrar = document.getElementById('btnBorrarTodo');
    if (btnBorrar) {
        btnBorrar.disabled = true;
        btnBorrar.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Eliminando registros...';
    }

    try {
        const querySnapshot = await getDocs(collection(db, "solicitudes"));
        const totalDocumentos = querySnapshot.size;

        if (totalDocumentos === 0) {
            if (window.mostrarNotificacion) window.mostrarNotificacion("La base de datos ya está vacía.", "info");
            if (btnBorrar) {
                btnBorrar.disabled = false;
                btnBorrar.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> Borrar Todos los Registros';
            }
            return;
        }

        const documentos = querySnapshot.docs;
        const tamanoLote = 400;

        for (let i = 0; i < documentos.length; i += tamanoLote) {
            const batch = writeBatch(db);
            const chunk = documentos.slice(i, i + tamanoLote);

            chunk.forEach((documento) => {
                batch.delete(documento.ref);
            });

            await batch.commit();
        }

        if (window.mostrarNotificacion) {
            window.mostrarNotificacion(`🗑️ Se eliminaron ${totalDocumentos} registros correctamente. Base de datos limpia.`, "warning");
        }

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (error) {
        console.error("Error al vaciar la base de datos:", error);
        if (window.mostrarNotificacion) window.mostrarNotificacion("❌ Error al intentar vaciar la base de datos.", "error");
        if (btnBorrar) {
            btnBorrar.disabled = false;
            btnBorrar.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> Borrar Todos los Registros';
        }
    }
}
