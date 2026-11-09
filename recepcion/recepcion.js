// recepcion/recepcion.js
import { db, collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp } from '../js/firebase-config.js';

let solicitudes = [];
let listaCitas = [];
let paginaActual = 1;
const filasPorPagina = 10;
let sesionActual = null;
let ultimosFiltrados = []; // Almacena temporalmente el resultado actual del filtro para la impresión

document.addEventListener('DOMContentLoaded', () => {
    // Validar sesión activa
    sesionActual = JSON.parse(localStorage.getItem('usuarioActivo'));
    if (!sesionActual) {
        window.location.href = '../index.html';
        return;
    }

    const form = document.getElementById('formCaptura');
    const selectTipo = document.getElementById('tipoGestion');
    const inputBuscar = document.getElementById('buscarRecepcion');
    const inputColonia = document.getElementById('colonia');
    const labelUbi = document.getElementById('labelUbicacion');
    const thUbi = document.getElementById('thUbicacion');
    const contenedorPrioridad = document.getElementById('contenedorPrioridad');

    // Inicializar indicador de usuario y fecha en la barra superior
    const elemNombre = document.getElementById('nombreOperador');
    const elemDepto = document.getElementById('labelDeptoActivo');
    const elemFecha = document.getElementById('currentDate');

    if (elemNombre) elemNombre.textContent = sesionActual.nombre;
    if (elemDepto) elemDepto.textContent = sesionActual.departamento;
    if (elemFecha) elemFecha.textContent = new Date().toLocaleDateString('es-MX');

    const inputFecha = document.getElementById('fecha');
    if (inputFecha) inputFecha.valueAsDate = new Date();

    // Configurar interfaz según el rol del usuario conectado
    if (sesionActual.rol === 'bienestar') {
        if (selectTipo) selectTipo.value = "BIENESTAR SOCIAL 2026";
        if (labelUbi) labelUbi.textContent = "Colonia *";
        if (thUbi) thUbi.textContent = "Colonia";
        if (inputColonia) inputColonia.placeholder = "Ej. Belén Grande, El Zapotito";
        if (contenedorPrioridad) contenedorPrioridad.style.display = "block";
    } else if (sesionActual.rol === 'territorio') {
        if (selectTipo) selectTipo.value = "PUEBLO Y TERRITORIO 2026";
        if (labelUbi) labelUbi.textContent = "Localidad *";
        if (thUbi) thUbi.textContent = "Localidad";
        if (inputColonia) inputColonia.placeholder = "Ej. El Salto, El Totoposte";
        if (contenedorPrioridad) contenedorPrioridad.style.display = "none";
    }

    // Escuchar datos en tiempo real de Firestore (Solicitudes y Citas)
    escucharSolicitudes();
    escucharCitas();

    // Guardar Petición
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const tipoGestionVal = selectTipo ? selectTipo.value : '';
            const folioVal = document.getElementById('folio').value.toUpperCase().trim();
            const fechaVal = inputFecha ? inputFecha.value : '';
            const nombreVal = document.getElementById('nombre').value.toUpperCase().trim();
            const cargoVal = document.getElementById('cargo').value;
            const ubicacionVal = inputColonia ? inputColonia.value.toUpperCase().trim() : '';
            const referenciasVal = document.getElementById('referencias').value.trim() || 'S/N';
            const clasificacionVal = document.getElementById('clasificacion').value.toUpperCase().trim();
            const requerimientoVal = document.getElementById('requerimiento').value.toUpperCase().trim();
            const rutaVal = document.getElementById('ruta').value.toUpperCase().trim();
            const detallesVal = document.getElementById('detalles').value.trim();

            const nuevaSolicitud = {
                tipoGestion: tipoGestionVal,
                folio: folioVal,
                fecha: fechaVal,
                nombre: nombreVal,
                cargo: cargoVal,
                referencias: referenciasVal,
                clasificacion: clasificacionVal,
                requerimiento: requerimientoVal,
                detalles: detallesVal,
                ruta: rutaVal,
                status: 'PENDIENTE',
                observaciones: '',
                createdAt: serverTimestamp()
            };

            if (sesionActual.rol === 'bienestar') {
                nuevaSolicitud.colonia = ubicacionVal;
                const inputPrioridad = document.getElementById('prioridad');
                nuevaSolicitud.prioridad = inputPrioridad ? inputPrioridad.value.toUpperCase().trim() || 'NORMAL' : 'NORMAL';
            } else {
                nuevaSolicitud.localidad = ubicacionVal;
            }

            try {
                await addDoc(collection(db, "solicitudes"), nuevaSolicitud);
                alert(`✅ Petición registrada exitosamente con el Folio: ${folioVal} (Estatus: PENDIENTE)`);
                form.reset();
                if (inputFecha) inputFecha.valueAsDate = new Date();
                if (selectTipo) selectTipo.value = sesionActual.rol === 'bienestar' ? "BIENESTAR SOCIAL 2026" : "PUEBLO Y TERRITORIO 2026";
            } catch (error) {
                console.error("Error al guardar:", error);
                alert("❌ Ocurrió un error al guardar la petición.");
            }
        });
    }

    // Buscador en tabla
    if (inputBuscar) {
        inputBuscar.addEventListener('input', () => {
            paginaActual = 1;
            renderizarTabla();
        });
    }

    // Validación de coincidencia de Nombre (Al salir del campo)
    const inputNombre = document.getElementById('nombre');
    if (inputNombre) {
        inputNombre.addEventListener('blur', () => {
            const nombreIngresado = inputNombre.value.trim().toUpperCase();
            if (!nombreIngresado) return;

            const coincidencias = solicitudes.filter(s => s.nombre && s.nombre.toUpperCase() === nombreIngresado);

            if (coincidencias.length > 0) {
                const tbodyCoincidencias = document.getElementById('tablaCoincidenciasBody');
                if (tbodyCoincidencias) {
                    tbodyCoincidencias.innerHTML = coincidencias.map(c => `
                        <tr>
                            <td class="py-2.5 px-3 font-mono font-bold text-emerald-800">${c.folio || 'S/F'}</td>
                            <td class="py-2.5 px-3">${c.fecha || '--'}</td>
                            <td class="py-2.5 px-3 font-medium">${c.requerimiento || 'Sin especificar'}</td>
                            <td class="py-2.5 px-3">
                                <span class="px-2.5 py-1 rounded-full font-bold text-[10px] ${c.status === 'REALIZADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                                    ${c.status || 'PENDIENTE'}
                                </span>
                            </td>
                        </tr>
                    `).join('');
                }

                const modal = document.getElementById('modalCoincidencia');
                if (modal) modal.classList.remove('hidden');
            }
        });
    }
});

// Listener en Tiempo Real de Solicitudes Firestore
function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        solicitudes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarDatalistsInteligentes();
        renderizarTabla();
    });
}

// Listener en Tiempo Real de Citas Firestore
function escucharCitas() {
    const q = query(collection(db, "citas"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        listaCitas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderizarTablaCitas();
    });
}

// Renderizado de Tabla de Citas
function renderizarTablaCitas() {
    const tbody = document.getElementById('tablaCitasBody');
    if (!tbody) return;

    tbody.innerHTML = listaCitas.map(c => `
        <tr class="hover:bg-slate-50">
            <td class="py-3 px-4 font-mono font-bold text-teal-800">${c.folio || 'S/F'}</td>
            <td class="py-3 px-4">${c.fechaCita || '--'} <br><span class="text-[10px] text-slate-500">${c.horaCita || '--'} hrs</span></td>
            <td class="py-3 px-4 font-bold text-slate-800">${c.nombreSolicitante || ''}</td>
            <td class="py-3 px-4">${c.asunto || ''}</td>
            <td class="py-3 px-4">
                <span class="px-2.5 py-1 rounded-full font-bold text-[10px] bg-teal-100 text-teal-800 border border-teal-300">
                    ${c.estatus || 'PROGRAMADA'}
                </span>
            </td>
            <td class="py-3 px-4 text-center space-x-2">
                <button onclick="abrirModalEditarCita('${c.id}')" class="text-blue-600 hover:text-blue-800 font-bold p-1" title="Editar Cita">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="eliminarCita('${c.id}', '${c.folio || 'S/F'}')" class="text-rose-600 hover:text-rose-800 font-bold p-1" title="Eliminar Cita">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Retroalimentar dinámicamente Clasificaciones, Rutas y Prioridades
function actualizarDatalistsInteligentes() {
    const datalistClasif = document.getElementById('listaClasificaciones');
    const datalistRutas = document.getElementById('listaRutas');
    const datalistPrioridades = document.getElementById('listaPrioridades');

    if (datalistClasif) {
        const clasifUnicas = [...new Set(solicitudes.map(s => s.clasificacion).filter(Boolean))].sort();
        datalistClasif.innerHTML = clasifUnicas.map(c => `<option value="${c}">`).join('');
    }

    if (datalistRutas) {
        const rutasUnicas = [...new Set(solicitudes.map(s => s.ruta).filter(Boolean))].sort();
        datalistRutas.innerHTML = rutasUnicas.map(r => `<option value="${r}">`).join('');
    }

    if (datalistPrioridades) {
        const prioridadesUnicas = [...new Set(solicitudes.map(s => s.prioridad).filter(Boolean))].sort();
        datalistPrioridades.innerHTML = prioridadesUnicas.map(p => `<option value="${p}">`).join('');
    }
}

// Renderizado de Tabla con Paginación a 10 filas y Botones de Acción
// Renderizado de Tabla con Paginación a 10 filas, Numeración y Resolución Directiva
function renderizarTabla() {
    const tbody = document.getElementById('tablaRecepcionBody');
    if (!tbody) return;

    const busqueda = document.getElementById('buscarRecepcion')?.value.toLowerCase() || '';
    
    ultimosFiltrados = solicitudes.filter(s => {
        const perteneceDepto = sesionActual.rol === 'bienestar' 
            ? s.tipoGestion?.includes('BIENESTAR') 
            : s.tipoGestion?.includes('PUEBLO');

        const cumpleBusqueda = 
            (s.folio && s.folio.toLowerCase().includes(busqueda)) ||
            (s.nombre && s.nombre.toLowerCase().includes(busqueda)) ||
            (s.colonia && s.colonia.toLowerCase().includes(busqueda)) ||
            (s.localidad && s.localidad.toLowerCase().includes(busqueda)) ||
            (s.requerimiento && s.requerimiento.toLowerCase().includes(busqueda)) ||
            (s.clasificacion && s.clasificacion.toLowerCase().includes(busqueda));

        return perteneceDepto && cumpleBusqueda;
    });

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const paginados = ultimosFiltrados.slice(inicio, fin);

    tbody.innerHTML = paginados.map((s, index) => {
        const numeroSecuencial = inicio + index + 1; // Numeración continua basada en la página
        const ubi = s.colonia || s.localidad || 'N/D';
        
        // Enlace para que recepción vea la evidencia fotográfica subida por la directora
        const evidenciaHtml = s.fotoUrl ? 
            `<a href="${s.fotoUrl}" target="_blank" class="text-teal-700 font-bold hover:underline flex items-center text-[10px] mt-1"><i class="fa-solid fa-image mr-1"></i> Ver Evidencia Resolución</a>` : 
            `<span class="text-[10px] text-slate-400 block mt-1">Sin evidencia aún</span>`;

        return `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-3 font-bold text-slate-500 text-center">${numeroSecuencial}</td>
                <td class="py-3 px-3 font-mono font-bold text-emerald-800">${s.folio || 'S/F'}</td>
                <td class="py-3 px-3">${s.fecha || '--'}</td>
                <td class="py-3 px-3">
                    <span class="font-bold text-slate-800 block">${s.nombre || ''}</span>
                    <span class="text-[10px] text-slate-400">${s.cargo || ''}</span>
                </td>
                <td class="py-3 px-3">${ubi}</td>
                <td class="py-3 px-3">
                    <span class="font-semibold text-slate-700 block">${s.requerimiento || ''}</span>
                    <span class="text-[10px] text-slate-500 line-clamp-1">${s.detalles || ''}</span>
                </td>
                <td class="py-3 px-3"><span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold text-[10px]">${s.clasificacion || ''}</span></td>
                <td class="py-3 px-3 text-slate-600 text-[11px] italic bg-slate-50/50 rounded">
                    <span class="font-bold not-italic text-slate-700 block text-[10px]">Resolución / Obs:</span>
                    ${s.observaciones || 'Pendiente de dictamen'}
                    ${evidenciaHtml}
                </td>
                <td class="py-3 px-3">${obtenerBadgeEstatus(s.status)}</td>
                <td class="py-3 px-3 text-center space-x-2">
                    <button onclick="abrirModalEditar('${s.id}')" class="text-blue-600 hover:text-blue-800 font-bold p-1" title="Editar Solicitud">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="eliminarSolicitud('${s.id}', '${s.folio || 'S/F'}')" class="text-rose-600 hover:text-rose-800 font-bold p-1" title="Eliminar Solicitud">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderizarPaginador(ultimosFiltrados.length);
}


// Función Global para Imprimir lo Filtrado
window.imprimirFiltrados = () => {
    if (!ultimosFiltrados || ultimosFiltrados.length === 0) {
        alert("No hay registros filtrados para imprimir.");
        return;
    }

    const ventanaImpresion = window.open('', '_blank');
    const tituloDepto = sesionActual.departamento || 'REPORTE DE SOLICITUDES';

    let contenidoHTML = `
        <html>
        <head>
            <title>Reporte de Solicitudes - ${tituloDepto}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 20px; }
                h2 { text-align: center; margin-bottom: 5px; color: #065f46; }
                p { text-align: center; margin-top: 0; color: #666; font-size: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; }
                tr:nth-child(even) { background-color: #f8fafc; }
            </style>
        </head>
        <body>
            <h2>SISTEMA MUNICIPAL DIF - SAN ANDRÉS TUXTLA</h2>
            <p>Reporte filtrado: ${tituloDepto} | Fecha de impresión: ${new Date().toLocaleDateString('es-MX')}</p>
            <table>
                <thead>
                    <tr>
                        <th>Folio</th>
                        <th>Fecha</th>
                        <th>Solicitante / Cargo</th>
                        <th>Ubicación</th>
                        <th>Requerimiento</th>
                        <th>Clasificación</th>
                        <th>Estatus</th>
                    </tr>
                </thead>
                <tbody>
    `;

    ultimosFiltrados.forEach(s => {
        const ubi = s.colonia || s.localidad || 'N/D';
        contenidoHTML += `
            <tr>
                <td><b>${s.folio || 'S/F'}</b></td>
                <td>${s.fecha || '--'}</td>
                <td>${s.nombre || ''} (${s.cargo || ''})</td>
                <td>${ubi}</td>
                <td>${s.requerimiento || ''}</td>
                <td>${s.clasificacion || ''}</td>
                <td><b>${s.status || 'PENDIENTE'}</b></td>
            </tr>
        `;
    });

    contenidoHTML += `
                </tbody>
            </table>
        </body>
        </html>
    `;

    ventanaImpresion.document.write(contenidoHTML);
    ventanaImpresion.document.close();
    ventanaImpresion.focus();
    setTimeout(() => {
        ventanaImpresion.print();
        ventanaImpresion.close();
    }, 500);
};

function obtenerBadgeEstatus(status) {
    const estado = (status || 'PENDIENTE').toUpperCase();
    const colores = {
        'PENDIENTE': 'bg-amber-100 text-amber-800 border border-amber-300',
        'EN PROCESO': 'bg-blue-100 text-blue-800 border border-blue-300',
        'CANALIZADO': 'bg-purple-100 text-purple-800 border border-purple-300',
        'REALIZADO': 'bg-emerald-100 text-emerald-800 border border-emerald-300'
    };
    return `<span class="${colores[estado] || 'bg-slate-100 text-slate-800'} px-2.5 py-1 rounded-full font-bold text-[10px] shadow-sm">${estado}</span>`;
}

// Funciones Globales para Cargar y Guardar la Edición Completa de Todos los Campos
window.abrirModalEditar = (id) => {
    const solicitud = solicitudes.find(s => s.id === id);
    if (!solicitud) return;

    document.getElementById('editId').value = solicitud.id;
    document.getElementById('editFolio').value = solicitud.folio || '';
    document.getElementById('editFecha').value = solicitud.fecha || '';
    document.getElementById('editNombre').value = solicitud.nombre || '';
    document.getElementById('editCargo').value = solicitud.cargo || '';
    
    const labelEditUbi = document.getElementById('editLabelUbi');
    const inputEditColonia = document.getElementById('editColonia');
    if (solicitud.colonia !== undefined) {
        if (labelEditUbi) labelEditUbi.textContent = "Colonia *";
        inputEditColonia.value = solicitud.colonia || '';
    } else {
        if (labelEditUbi) labelEditUbi.textContent = "Localidad *";
        inputEditColonia.value = solicitud.localidad || '';
    }

    document.getElementById('editReferencias').value = solicitud.referencias || '';
    document.getElementById('editClasificacion').value = solicitud.clasificacion || '';
    document.getElementById('editRequerimiento').value = solicitud.requerimiento || '';
    document.getElementById('editRuta').value = solicitud.ruta || '';
    
    const contenedorPrioridadEdit = document.getElementById('editContainerPrioridad');
    if (solicitud.prioridad !== undefined) {
        if (contenedorPrioridadEdit) contenedorPrioridadEdit.style.display = "block";
        document.getElementById('editPrioridad').value = solicitud.prioridad || '';
    } else {
        if (contenedorPrioridadEdit) contenedorPrioridadEdit.style.display = "none";
    }

    document.getElementById('editDetalles').value = solicitud.detalles || '';

    document.getElementById('modalEditar').classList.remove('hidden');
};

window.cerrarModalEditar = () => {
    document.getElementById('modalEditar').classList.add('hidden');
};

window.guardarEdicion = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    
    const fecha = document.getElementById('editFecha').value;
    const nombre = document.getElementById('editNombre').value.toUpperCase().trim();
    const cargo = document.getElementById('editCargo').value.toUpperCase().trim();
    const valorUbicacion = document.getElementById('editColonia').value.toUpperCase().trim();
    const referencias = document.getElementById('editReferencias').value.trim() || 'S/N';
    const clasificacion = document.getElementById('editClasificacion').value.toUpperCase().trim();
    const requerimiento = document.getElementById('editRequerimiento').value.toUpperCase().trim();
    const ruta = document.getElementById('editRuta').value.toUpperCase().trim();
    const detalles = document.getElementById('editDetalles').value.trim();

    const datosActualizados = {
        fecha,
        nombre,
        cargo,
        referencias,
        clasificacion,
        requerimiento,
        ruta,
        detalles
    };

    const solicitudOriginal = solicitudes.find(s => s.id === id);
    if (solicitudOriginal && solicitudOriginal.colonia !== undefined) {
        datosActualizados.colonia = valorUbicacion;
        const inputPrioridadEdit = document.getElementById('editPrioridad');
        datosActualizados.prioridad = inputPrioridadEdit ? inputPrioridadEdit.value.toUpperCase().trim() || 'NORMAL' : 'NORMAL';
    } else {
        datosActualizados.localidad = valorUbicacion;
    }

    try {
        const docRef = doc(db, "solicitudes", id);
        await updateDoc(docRef, datosActualizados);

        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("✅ Solicitud actualizada completamente", "success");
        } else {
            alert("✅ Solicitud actualizada completamente.");
        }
        cerrarModalEditar();
    } catch (error) {
        console.error("Error al actualizar:", error);
        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("❌ No se pudo actualizar el registro", "error");
        } else {
            alert("❌ No se pudo actualizar el registro.");
        }
    }
};

// Función para guardar y notificar nuevas citas hacia Dirección General
window.guardarCita = async (e) => {
    e.preventDefault();

    const nombreVal = document.getElementById('citaNombre').value.toUpperCase().trim();
    const fechaVal = document.getElementById('citaFecha').value;
    const horaVal = document.getElementById('citaHora').value;
    const asuntoVal = document.getElementById('citaAsunto').value.toUpperCase().trim();

    const nuevaCita = {
        folio: `CTA-${Date.now().toString().slice(-4)}`,
        nombreSolicitante: nombreVal,
        fechaCita: fechaVal,
        horaCita: horaVal,
        asunto: asuntoVal,
        estatus: 'PROGRAMADA',
        agendadoPor: sesionActual ? sesionActual.nombre : 'Recepción',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "citas"), nuevaCita);
        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("✅ Cita agendada correctamente y notificada a Dirección General", "success");
        } else {
            alert("✅ Cita agendada correctamente y notificada a Dirección General.");
        }
        document.getElementById('formCita').reset();
        cerrarModalCita();
    } catch (error) {
        console.error("Error al agendar cita:", error);
        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("❌ No se pudo agendar la cita", "error");
        } else {
            alert("❌ No se pudo agendar la cita.");
        }
    }
};

// Funciones para Editar y Eliminar Citas
window.abrirModalEditarCita = (id) => {
    const cita = listaCitas.find(c => c.id === id);
    if (!cita) return;

    document.getElementById('editCitaId').value = cita.id;
    document.getElementById('editCitaNombre').value = cita.nombreSolicitante || '';
    document.getElementById('editCitaFecha').value = cita.fechaCita || '';
    document.getElementById('editCitaHora').value = cita.horaCita || '';
    document.getElementById('editCitaAsunto').value = cita.asunto || '';
    document.getElementById('editCitaEstatus').value = cita.estatus || 'PROGRAMADA';

    document.getElementById('modalEditarCita').classList.remove('hidden');
};

window.guardarEdicionCita = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editCitaId').value;

    const datosActualizados = {
        nombreSolicitante: document.getElementById('editCitaNombre').value.toUpperCase().trim(),
        fechaCita: document.getElementById('editCitaFecha').value,
        horaCita: document.getElementById('editCitaHora').value,
        asunto: document.getElementById('editCitaAsunto').value.toUpperCase().trim(),
        estatus: document.getElementById('editCitaEstatus').value
    };

    try {
        const docRef = doc(db, "citas", id);
        await updateDoc(docRef, datosActualizados);
        
        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("✅ Cita actualizada correctamente", "success");
        } else {
            alert("✅ Cita actualizada correctamente.");
        }
        cerrarModalEditarCita();
    } catch (error) {
        console.error("Error al actualizar cita:", error);
        alert("❌ Ocurrió un error al actualizar la cita.");
    }
};

window.eliminarCita = async (id, folio) => {
    if (confirm(`¿Estás seguro de eliminar la cita con folio ${folio}?`)) {
        try {
            await deleteDoc(doc(db, "citas", id));
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion("🗑️ Cita eliminada correctamente", "info");
            } else {
                alert("🗑️ Cita eliminada correctamente.");
            }
        } catch (error) {
            console.error("Error al eliminar cita:", error);
            alert("❌ Ocurrió un error al eliminar la cita.");
        }
    }
};

window.eliminarSolicitud = async (id, folio) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente la solicitud con Folio: ${folio}?`)) {
        try {
            await deleteDoc(doc(db, "solicitudes", id));
            alert("🗑️ Solicitud eliminada correctamente de Firebase.");
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("❌ Ocurrió un error al intentar eliminar el registro.");
        }
    }
};

function renderizarPaginador(totalItems) {
    const totalPaginas = Math.ceil(totalItems / filasPorPagina) || 1;
    const contenedor = document.getElementById('paginadorRecepcion');
    if(!contenedor) return;

    contenedor.innerHTML = `
        <div>Mostrando <span class="font-bold text-slate-700">${totalItems > 0 ? (paginaActual - 1) * filasPorPagina + 1 : 0}</span> a <span class="font-bold text-slate-700">${Math.min(paginaActual * filasPorPagina, totalItems)}</span> de <span class="font-bold text-slate-700">${totalItems}</span></div>
        <div class="flex items-center space-x-2">
            <button onclick="cambiarPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50">Anterior</button>
            <span class="px-3 py-1.5 bg-emerald-700 text-white font-bold rounded">${paginaActual} / ${totalPaginas}</span>
            <button onclick="cambiarPagina(${paginaActual + 1})" ${paginaActual >= totalPaginas ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50">Siguiente</button>
        </div>
    `;
}

window.cambiarPagina = (nuevaPagina) => {
    paginaActual = nuevaPagina;
    renderizarTabla();
};
